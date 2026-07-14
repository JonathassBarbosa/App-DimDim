# DimDim — app financeiro completo

DimDim é um PWA (funciona no navegador e pode ser "instalado" no celular) para organizar
sua vida financeira: lista de compras com memória, leitura de nota fiscal por foto,
histórico de compras, painel com a regra 50-30-20, contas e cartões, contas a pagar,
metas de economia, pagamento/recebimento por aproximação (NFC) e conexão com bancos via
Open Finance.

Não tem build, não tem servidor Node — é HTML/CSS/JS puro que fala com uma planilha
Google (via Apps Script) como banco de dados gratuito.

## Como rodar

Abra `index.html` num navegador (idealmente servido por HTTPS ou `localhost`, já que
NFC, geolocalização e o Service Worker exigem contexto seguro). Para desenvolvimento
local:

```
python3 -m http.server 8080
```

e acesse `http://localhost:8080/index.html`.

## Backend (Google Apps Script)

1. Crie uma Planilha Google nova.
2. Extensões > Apps Script, apague o conteúdo padrão e cole `apps-script/Code.gs`.
3. Rode a função `configurarPlanilhaInicial` uma vez (cria todas as abas: Compras,
   Categorias_Config, Custos_Fixos_App, Proventos_App, Contas, Cartoes, Contas_Pagar,
   Metas, Transacoes, OpenFinance_Conexoes).
4. Implantar > Nova implantação > tipo "App da Web". Executar como "Eu", acesso
   "Qualquer pessoa".
5. Copie a URL que termina em `/exec` e cole na constante `SCRIPT_URL` no topo do
   `<script>` de `index.html`.
6. Sempre que editar o `Code.gs`, gere uma **nova versão** em "Gerenciar implantações"
   para as mudanças valerem.

## Pagar e receber por NFC

Usa a [Web NFC API](https://developer.mozilla.org/docs/Web/API/Web_NFC_API) —
funciona hoje só no **Chrome para Android**, com NFC ligado no aparelho, servindo o
app por HTTPS. Não existe suporte a Web NFC no iOS/Safari nem em desktop.

Importante: isso **não é um leitor de cartão de crédito/débito por aproximação**
(tipo maquininha) — isso exigiria certificação com uma adquirente (Stone, Cielo etc.)
e não é algo que um app web possa fazer. O que o DimDim faz de verdade com NFC:

- **Pagar aproximando**: leia uma tag NFC gravada pelo próprio DimDim (contendo
  descrição/categoria/valor de um gasto recorrente, tipo "café da esquina") e registre
  a despesa com um toque.
- **Gravar tag de pagamento**: grave esses dados numa tag NFC em branco (as tags NTAG
  213/215/216 são baratas e fáceis de achar).
- **Receber com Pix**: gera um código Pix "copia e cola" válido (padrão EMV do Banco
  Central, com CRC16 correto) a partir da sua chave Pix, nome e cidade. Mostra como
  QR Code e permite gravar o texto numa tag NFC — quem tocar o celular nela (rodando o
  DimDim ou outro leitor NFC) recebe o código para colar no banco. O dinheiro sempre
  se move pelo Pix normal do banco de quem paga — o NFC aqui só compartilha o código
  na hora, sem digitar nada.

## Open Finance (conectar bancos de verdade)

Integração real via [Pluggy](https://pluggy.ai), agregador de Open Finance brasileiro
com sandbox gratuito. A chave secreta **nunca** fica no app — fica só no backend
(Apps Script), que troca `CLIENT_ID`/`CLIENT_SECRET` por um `connectToken` de uso único
que o navegador usa para abrir o widget oficial da Pluggy.

Para ativar:

1. Crie uma conta grátis em https://dashboard.pluggy.ai e pegue seu `CLIENT_ID` e
   `CLIENT_SECRET` (comece pelo ambiente sandbox, que simula bancos sem dados reais).
2. No projeto de Apps Script: ⚙️ Configurações do projeto > Propriedades do script >
   adicione `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`.
3. Rode `configurarPlanilhaInicial` de novo e faça uma nova implantação.
4. No app, vá em Mais > Bancos (Open Finance) e toque em "Conectar novo banco".

Sem isso configurado, a tela de Bancos avisa claramente que a conexão não está
disponível — o app nunca mostra saldo ou extrato inventado.

Quando conectado, o DimDim importa saldo das contas e o extrato recente para dentro
da planilha (`Contas` e `Compras`), então eles entram automaticamente no painel
50-30-20 e no saldo consolidado.

## Estrutura do projeto

```
index.html          App inteiro (HTML + CSS + JS), sem build step
manifest.json        Metadados do PWA
sw.js                 Service worker (cache offline)
assets/, icons/       Logo e ícones
apps-script/Code.gs   Backend — cole isso no Apps Script da sua planilha
```

## Funcionalidades

- Lista de compras com memória (itens ficam salvos e marcados para a próxima compra)
- Leitura de nota fiscal por foto (OCR local, via Tesseract.js)
- Histórico de compras por data, com localização opcional
- Painel com a regra 50-30-20 e alerta quando uma categoria estoura o orçamento
- Contas e carteiras (manuais ou conectadas via Open Finance) com saldo consolidado
- Cartões de crédito (limite, fechamento, vencimento)
- Contas a pagar, com recorrência mensal e registro automático do pagamento como despesa
- Metas de economia com barra de progresso e aportes
- Pagamento e recebimento por NFC (experimental) e recebimento via Pix (QR + copia-e-cola)
- Conexão Open Finance via Pluggy para importar saldo e extrato de bancos reais
