# Instruções para trabalhar neste projeto

## Limpeza de testes e previews

- Não mantenha capturas de tela, PDFs de exemplo, vídeos, traces, relatórios ou páginas e scripts temporários de preview no projeto após a validação.
- Para capturas com Playwright, prefira `page.screenshot()` sem `path` e inspecione o buffer em memória.
- Quando precisar salvar arquivos, crie uma pasta exclusiva fora do repositório com `mkdtemp` no diretório temporário do sistema (`os.tmpdir()`).
- Remova essa pasta e seus arquivos em um bloco `finally`, mesmo se o teste ou a inspeção falhar. Feche também os navegadores e servidores iniciados para o teste.
- Antes de concluir uma tarefa, confira se nenhum artefato temporário foi deixado no repositório. Apague páginas, dados fictícios e scripts criados somente para aquela inspeção.
- Regras no `.gitignore` apenas evitam versionamento; elas não substituem a exclusão dos arquivos temporários.
- Só preserve uma captura ou outro artefato de teste se o usuário solicitar explicitamente sua entrega ou armazenamento.
- Preserve os testes automatizados permanentes, arquivos da aplicação, recursos visuais utilizados e documentos operacionais.
