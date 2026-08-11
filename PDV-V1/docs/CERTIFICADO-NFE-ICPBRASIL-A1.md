# Certificado NF-e: desenvolvimento x homologacao real

## 1. Certificado de desenvolvimento

Para testar apenas a UI, o upload do arquivo e a leitura local da chave privada, use o script:

```powershell
pwsh -File .\docs\generate-dev-nfe-certificate.ps1
```

Saida padrao:

- `.\.codex-temp\certificados-dev\pdv-dev-nfe-test.pfx`
- `.\.codex-temp\certificados-dev\pdv-dev-nfe-test.cer`
- `.\.codex-temp\certificados-dev\pdv-dev-nfe-test.txt`

Observacoes:

- Esse PFX e `self-signed`.
- Ele serve para validar a tela e o teste local do PDV.
- Ele **nao** sera aceito pela Nuvem Fiscal.
- Ele **nao** sera aceito pela SEFAZ.

## 2. Como o PDV valida agora

O teste do certificado no PDV passa a separar duas coisas:

- o arquivo abriu e a chave privada respondeu localmente
- o certificado **aparenta** ou nao ser um `ICP-Brasil/A1`

Se for um PFX de desenvolvimento, o teste local pode abrir normalmente, mas a tela vai alertar que ele parece `self-signed` e que nao serve para NF-e real.

## 3. Checklist rapido para homologacao real

Use este checklist antes de testar Nuvem Fiscal ou SEFAZ:

1. O certificado precisa ser `ICP-Brasil` modelo `A1`.
2. O arquivo precisa estar em `.pfx` ou `.p12`.
3. O CNPJ do certificado precisa ser o mesmo CNPJ fiscal da empresa configurada no PDV.
4. O certificado nao pode estar vencido.
5. Em Nuvem Fiscal, `Homologacao` usa credencial `Sandbox`.
6. Em Nuvem Fiscal, o certificado continua precisando ser real mesmo em `Sandbox`.
7. Se o arquivo foi convertido manualmente, prefira exportar novamente o PFX original pela certificadora.
8. Se a Nuvem Fiscal retornar `InvalidCertificate`, confirme com a certificadora que o arquivo realmente e `A1 ICP-Brasil`.

## 4. Fluxo sugerido

1. Teste com o PFX de desenvolvimento para validar a UI e o armazenamento local.
2. Depois substitua pelo `A1 ICP-Brasil` real.
3. Rode novamente o teste de certificado no PDV.
4. Salve a configuracao fiscal.
5. Execute o teste de status do provider.

## 5. Referencias oficiais

- Nuvem Fiscal autenticacao: https://dev.nuvemfiscal.com.br/docs/autenticacao/
- Nuvem Fiscal NF-e: https://dev.nuvemfiscal.com.br/docs/nfe/
- Suporte Nuvem Fiscal sobre certificado digital: https://suporte.nuvemfiscal.com.br/t/certificado-digital/1278
- Suporte Nuvem Fiscal em sandbox: https://suporte.nuvemfiscal.com.br/t/certificado-digital-em-sandbox/4870
