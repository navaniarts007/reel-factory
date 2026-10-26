"""Load Chatterbox Turbo with little Windows memory.

Chatterbox's own loader builds each model on the CPU and also reads its whole weight file into RAM, so loading the
1.8 GB T3 model briefly needs about 4 GB of free memory (RAM + page file). On a busy 16 GB laptop Windows refuses
("The paging file is too small", os error 1455) or the process crashes.

Here each model is built straight on the GPU and its weights are read from the file one tensor at a time, so the
extra RAM needed is about one tensor (a few hundred MB at most). The steps are the same as
chatterbox.tts_turbo.ChatterboxTurboTTS.from_local (chatterbox-tts 0.1.7, MIT); the weights loaded are identical.
"""
import contextlib, json, os, struct
from pathlib import Path

import torch

DTYPES = {"F64": torch.float64, "F32": torch.float32, "F16": torch.float16, "BF16": torch.bfloat16, "I64": torch.int64,
          "I32": torch.int32, "I16": torch.int16, "I8": torch.int8, "U8": torch.uint8, "BOOL": torch.bool}


def tensors(path):
    """Yield (name, CPU tensor) from a .safetensors file, reading one tensor at a time (no memory map)."""
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        head = json.loads(f.read(n))
        base = 8 + n
        items = sorted(((k, v) for k, v in head.items() if k != "__metadata__"), key=lambda kv: kv[1]["data_offsets"][0])
        for k, v in items:
            a, b = v["data_offsets"]
            dt = DTYPES[v["dtype"]]
            if b == a:
                yield k, torch.empty(v["shape"], dtype=dt)
                continue
            f.seek(base + a)
            yield k, torch.frombuffer(bytearray(f.read(b - a)), dtype=dt).reshape(v["shape"])


def load_into(module, path):
    """Copy a weight file into a module's existing tensors, as strictly as load_state_dict(strict=True)."""
    target = module.state_dict()
    seen = set()
    with torch.no_grad():
        for k, t in tensors(path):
            if k not in target:
                raise KeyError(f"{Path(path).name}: unexpected weight {k}")
            if tuple(target[k].shape) != tuple(t.shape):
                raise ValueError(f"{Path(path).name}: {k} is {tuple(t.shape)}, the model expects {tuple(target[k].shape)}")
            target[k].copy_(t)
            seen.add(k)
    missing = set(target) - seen
    if missing:
        raise KeyError(f"{Path(path).name}: missing weights {sorted(missing)[:5]}")


def load_turbo(device):
    from chatterbox import tts_turbo as tt
    ckpt = Path(tt.snapshot_download(repo_id=tt.REPO_ID, token=os.getenv("HF_TOKEN") or None,
                                     allow_patterns=["*.safetensors", "*.json", "*.txt", "*.pt", "*.model"]))
    on = (lambda: torch.device(device)) if device == "cuda" else contextlib.nullcontext   # build each model where it will run

    with on():
        ve = tt.VoiceEncoder()
    load_into(ve, ckpt / "ve.safetensors")
    ve.to(device).eval()

    hp = tt.T3Config(text_tokens_dict_size=50276)          # Turbo's settings, as in from_local
    hp.llama_config_name = "GPT2_medium"
    hp.speech_tokens_dict_size = 6563
    hp.input_pos_emb = None
    hp.speech_cond_prompt_len = 375
    hp.use_perceiver_resampler = False
    hp.emotion_adv = False
    with on():
        t3 = tt.T3(hp)
    load_into(t3, ckpt / "t3_turbo_v1.safetensors")
    del t3.tfmr.wte
    t3.to(device).eval()

    with on():
        s3gen = tt.S3Gen(meanflow=True)
    load_into(s3gen, ckpt / "s3gen_meanflow.safetensors")
    s3gen.to(device).eval()
    if device == "cuda":
        torch.cuda.empty_cache()

    tokenizer = tt.AutoTokenizer.from_pretrained(ckpt)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    conds = None
    if (ckpt / "conds.pt").exists():
        conds = tt.Conditionals.load(ckpt / "conds.pt", map_location=None if device == "cuda" else torch.device("cpu")).to(device)
    return tt.ChatterboxTurboTTS(t3, s3gen, ve, tokenizer, device, conds=conds)
