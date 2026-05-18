# Security Notes

- Keep permissions narrow. Known AI hosts are declared by default; all-sites access is optional.
- Never commit real API tokens.
- Check before release:

```bash
rg -n "fetch|XMLHttpRequest|sendBeacon|eval|Function\\(|analytics|telemetry|mineruToken" src public
```

Expected network usage is limited to explicit MinerU OCR requests from `src/background/mineru.ts`.
