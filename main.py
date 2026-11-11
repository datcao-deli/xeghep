import os
import sys
import importlib.util

backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xeghep-backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

backend_main = os.path.join(backend_dir, "main.py")
spec = importlib.util.spec_from_file_location("xeghep_backend_app", backend_main)
backend_module = importlib.util.module_from_spec(spec)
sys.modules["xeghep_backend_app"] = backend_module
spec.loader.exec_module(backend_module)

app = backend_module.app

if __name__ == "__main__":
    import uvicorn
    os.environ.setdefault("PORT", "10000")
    port = int(os.environ["PORT"])
    uvicorn.run(app, host="0.0.0.0", port=port)
