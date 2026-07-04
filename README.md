# dimdim — seu dinheiro, sem enrolação

App de lista de compras com memória, leitura de nota fiscal por OCR, histórico por data e painel financeiro com a regra 50-30-20 — gratuito, hospedado no GitHub Pages, com o Google Sheets como banco de dados.

## O que o app faz

- **Lista**: cole ou digite seus itens uma vez. O app lembra pra sempre — nas próximas compras é só marcar.
- **Nota fiscal**: fotografe o cupom fiscal e o app lê os itens com OCR (Tesseract.js, gratuito, roda no navegador). Ele mostra o que reconheceu pra você confirmar, destaca em vermelho o que veio na nota mas não estava na sua lista, e avisa o que estava na lista mas não veio na nota.
- **Histórico**: compras organizadas por dia, recolhidas por padrão. "Hoje" fica aberta com os itens marcados na Lista — escolha a forma de pagamento e toque em "Finalizar". Itens fora da lista aparecem em vermelho, tanto no app quanto na planilha (coluna "Na Lista" e formatação condicional).
- **Painel**: saldo livre, seletor de período (dia/mês/ano) e a regra 50-30-20 (necessidades, desejos e investimentos) comparando meta x realizado.
- **Registro**: edite categorias e orçamentos, custos fixos e proventos direto pelo app — tudo grava na planilha.
- Alerta sonoro + tela vermelha quando uma categoria estoura o orçamento do mês.
- Splash inicial com a logo flutuando, some com fade ao abrir o app.
- Marca d'água discreta do símbolo dimdim no fundo de todas as telas.
- Funciona **offline** como PWA, instalável na tela inicial.

## Estrutura dos arquivos

```
webapp/                  → suba isso pro GitHub Pages
  index.html
  manifest.json
  sw.js
  icons/
apps-script/
  Code.gs                → cole no Apps Script da sua planilha
dimdim-planilha.xlsx     → sua planilha original + as abas novas
```

## Passo 1 — Preparar a planilha

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma planilha em branco.
2. Importe o arquivo `dimdim-planilha.xlsx` (Arquivo → Importar → Substituir planilha).
3. Confira as abas: **Dashboard**, **Planilha1** (a original, intacta), **Categorias_Config**, **Compras**, **Custos_Fixos_App**, **Proventos_App**.
4. Em **Categorias_Config**, ajuste orçamento e o grupo (Necessidade / Desejo / Investimento) de cada categoria — isso alimenta a regra 50-30-20.
5. Em **Custos_Fixos_App** e **Proventos_App** já vieram os valores que existiam na sua Planilha1 de julho — ajuste se quiser (também dá pra editar direto pelo app, na tela Registro).
6. A aba **Compras** começa vazia — é onde o app grava cada compra, com a coluna "Na Lista" marcando o que fugiu do planejado.

## Passo 2 — Publicar o backend (Google Apps Script)

1. Na planilha: **Extensões → Apps Script**.
2. Apague o conteúdo do `Code.gs` padrão e cole o conteúdo de `apps-script/Code.gs` deste projeto.
3. Selecione a função `configurarPlanilhaInicial` no menu suspenso do topo e clique em **Executar** uma vez (confirma que as abas existem — se você já importou a planilha pronta, pode pular).
4. **Implantar → Nova implantação → App da Web**.
   - Executar como: Eu.
   - Quem pode acessar: Qualquer pessoa.
5. Implante, autorize as permissões e copie a URL (termina em `/exec`).

> Sempre que editar o `Code.gs`, gere uma nova versão em "Gerenciar implantações" para as mudanças valerem.

## Passo 3 — Hospedar no GitHub Pages

1. Crie um repositório novo no GitHub.
2. Suba o conteúdo da pasta `webapp/` para a raiz (ou para `/docs`).
3. **Settings → Pages** → selecione a branch e a pasta → salve.
4. Abra a URL gerada no celular, vá em **Registro**, cole a URL do Apps Script, toque em **Testar** e depois **Salvar**.
5. Use "Adicionar à tela de início" no navegador do celular pra instalar como app.

## Uso no dia a dia

- **Lista**: adicione itens (formato livre: `nome, categoria, preço`).
- **Nota fiscal**: depois de comprar, fotografe o cupom em vez de digitar tudo de novo.
- **Histórico**: revise e finalize a compra do dia — escolha pagamento, use sua localização, finalize.
- **Painel**: acompanhe saldo livre e a regra 50-30-20 por dia, mês ou ano.
- **Registro**: ajuste categorias, custos fixos e proventos quando sua vida financeira mudar.

## Sobre a Fase 2 (Apple Shortcuts)

Continua reservada pra quando você quiser avançar — o endpoint do Apps Script já aceita POST com `action: "compra"`, então o Atalho da Apple só precisa perguntar valor/categoria e mandar pro mesmo endereço `/exec`.

## Limitações conhecidas

- OCR de nota fiscal depende da qualidade da foto — sempre revise os itens antes de confirmar.
- O catálogo de itens da Lista fica salvo no navegador de cada aparelho, não sincroniza entre dispositivos.
- Localização é só coordenadas (latitude/longitude), sem conversão automática pra endereço, para manter o app 100% gratuito.
