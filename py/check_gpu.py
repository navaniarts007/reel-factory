"""Check that PyTorch sees the GPU and that Chatterbox Turbo fits in its memory. Run by install.ps1."""
import sys, time
try:
    import torch
except ImportError:
    sys.exit("PyTorch is not installed in .venv")
if not torch.cuda.is_available():
    print("! PyTorch can't see an NVIDIA GPU. The voice will run on the CPU: set 'Run on' to CPU and model to Nano in Settings.")
    sys.exit(0)
name = torch.cuda.get_device_name(0); total = torch.cuda.get_device_properties(0).total_memory / 2**30
print(f"GPU: {name}, {total:.1f} GB")
import lowmem                                      # the same loader the voice step uses (little RAM needed)
t = time.time()
m = lowmem.load_turbo("cuda")
print(f"Chatterbox Turbo loaded in {time.time() - t:.0f} s; GPU memory in use: {torch.cuda.memory_allocated() / 2**30:.2f} GB")
if m.conds is not None:
    t = time.time(); wav = m.generate("Hello guys! Day one of my three sixty five day tech challenge."); dur = wav.shape[-1] / m.sr
    print(f"Test sentence: {dur:.1f} s of audio in {time.time() - t:.1f} s; peak GPU memory {torch.cuda.max_memory_allocated() / 2**30:.2f} GB")
print("✓ Voice model works on the GPU. Keep the laptop plugged in when generating voice.")
