# Backend Tests

Run the isolated backend test suite from the repository root:

```powershell
backend\venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

The tests use in-memory fakes and mocks. They do not connect to MongoDB or modify real Bazario data.
