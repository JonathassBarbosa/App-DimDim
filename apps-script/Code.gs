/**
 * DIMDIM — Backend (Google Apps Script)
 * -----------------------------------------------------------
 * Transforma sua Planilha Google em uma API HTTPS gratuita para o app DimDim:
 * lista de compras, nota fiscal (OCR), histórico, painel 50-30-20, contas e
 * cartões, contas a pagar, metas, pagamentos por NFC e conexão Open Finance
 * (via Pluggy).
 *
 * COMO IMPLANTAR
 * 1. Na planilha: Extensões > Apps Script.
 * 2. Apague o conteúdo do Code.gs padrão e cole este arquivo inteiro.
 * 3. Rode a função "configurarPlanilhaInicial" uma vez (menu topo > Executar).
 * 4. Implantar > Nova implantação > tipo "App da Web".
 *    Executar como: Eu. Quem pode acessar: Qualquer pessoa.
 * 5. Copie a URL (termina em /exec) e cole no app, na tela Registro.
 * 6. Ao editar este script, gere uma NOVA versão em "Gerenciar implantações".
 *
 * OPEN FINANCE (PLUGGY) — OPCIONAL
 * O DimDim consegue conectar contas bancárias de verdade via Pluggy
 * (agregador Open Finance brasileiro, com sandbox gratuito em pluggy.ai).
 * Sem isso configurado, a tela "Bancos" simplesmente informa que a conexão
 * não está disponível — nenhum dado falso é mostrado.
 * Para ativar:
 * 1. Crie uma conta grátis em https://dashboard.pluggy.ai e pegue seu
 *    CLIENT_ID e CLIENT_SECRET (comece pelo sandbox).
 * 2. Neste projeto de Apps Script: Configurações do projeto (ícone de
 *    engrenagem) > Propriedades do script > adicione:
 *      PLUGGY_CLIENT_ID = ...
 *      PLUGGY_CLIENT_SECRET = ...
 * 3. Rode "configurarPlanilhaInicial" de novo (cria as abas novas) e faça
 *    uma nova implantação.
 * O CLIENT_SECRET nunca é enviado ao app — fica só no servidor.
 */

const SHEET_COMPRAS = 'Compras';
const SHEET_CATEGORIAS = 'Categorias_Config';
const SHEET_CUSTOS_APP = 'Custos_Fixos_App';
const SHEET_PROVENTOS_APP = 'Proventos_App';
const SHEET_CONTAS = 'Contas';
const SHEET_CARTOES = 'Cartoes';
const SHEET_CONTAS_PAGAR = 'Contas_Pagar';
const SHEET_METAS = 'Metas';
const SHEET_TRANSACOES = 'Transacoes';
const SHEET_OF_CONEXOES = 'OpenFinance_Conexoes';

const PLUGGY_API = 'https://api.pluggy.ai';

function _ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function _sheet(name){
  const sh = _ss().getSheetByName(name);
  if(!sh) throw new Error('Aba não encontrada: ' + name + '. Rode configurarPlanilhaInicial().');
  return sh;
}
function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _rowsToObjects(sh){
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const out = [];
  for(let i=1;i<values.length;i++){
    const row = values[i];
    if(row.every(c=>c==='')) continue;
    const obj = {};
    headers.forEach((h,idx)=> obj[h] = row[idx]);
    out.push(obj);
  }
  return out;
}
function _findRowById(sh, id){
  const values = sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++){ if(String(values[i][0]) === String(id)) return i+1; }
  return -1;
}

/* ------------------------------------------------------------------ */
/* GET                                                                 */
/* ------------------------------------------------------------------ */
function doGet(e){
  try{
    const action = e.parameter.action || 'summary';
    if(action === 'categorias') return _json({ok:true, categorias:getCategorias()});
    if(action === 'summary'){
      const mes = e.parameter.mes ? parseInt(e.parameter.mes,10) : (new Date().getMonth()+1);
      return _json({ok:true, ...getResumoMensal(mes)});
    }
    if(action === 'painel'){
      const periodo = e.parameter.periodo || 'mes';
      return _json({ok:true, ...getPainelPeriodo(periodo)});
    }
    if(action === 'contas') return _json({ok:true, contas:listarContas()});
    if(action === 'cartoes') return _json({ok:true, cartoes:listarCartoes()});
    if(action === 'contasPagar') return _json({ok:true, itens:listarContasPagar()});
    if(action === 'metas') return _json({ok:true, itens:listarMetas()});
    if(action === 'openFinanceStatus') return _json({ok:true, configurado:pluggyConfigurado(), conexoes:listarConexoesOF()});
    return _json({ok:false, error:'Ação desconhecida: ' + action});
  }catch(err){
    return _json({ok:false, error:String(err)});
  }
}

/* ------------------------------------------------------------------ */
/* POST                                                                */
/* ------------------------------------------------------------------ */
function doPost(e){
  try{
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'compra';

    if(action === 'compra'){
      registrarCompra(body);
      const mesAtual = new Date().getMonth()+1;
      return _json({ok:true, ...getResumoMensal(mesAtual)});
    }
    if(action === 'categorias'){
      salvarCategorias(body.categorias || []);
      return _json({ok:true});
    }
    if(action === 'custosFixos'){
      salvarListaSimples(SHEET_CUSTOS_APP, body.itens || []);
      return _json({ok:true});
    }
    if(action === 'proventos'){
      salvarListaSimples(SHEET_PROVENTOS_APP, body.itens || []);
      return _json({ok:true});
    }

    if(action === 'conta') return _json({ok:true, conta: salvarConta(body.conta || {})});
    if(action === 'excluirConta'){ excluirLinha(SHEET_CONTAS, body.id); return _json({ok:true}); }

    if(action === 'cartao') return _json({ok:true, cartao: salvarCartao(body.cartao || {})});
    if(action === 'excluirCartao'){ excluirLinha(SHEET_CARTOES, body.id); return _json({ok:true}); }

    if(action === 'contaPagar') return _json({ok:true, item: salvarContaPagar(body.item || {})});
    if(action === 'marcarPago') return _json({ok:true, item: marcarContaPagarPaga(body.id, body.contaId)});
    if(action === 'excluirContaPagar'){ excluirLinha(SHEET_CONTAS_PAGAR, body.id); return _json({ok:true}); }

    if(action === 'meta') return _json({ok:true, item: salvarMeta(body.item || {})});
    if(action === 'aporteMeta') return _json({ok:true, item: aportarMeta(body.id, Number(body.valor)||0) });
    if(action === 'excluirMeta'){ excluirLinha(SHEET_METAS, body.id); return _json({ok:true}); }

    // NFC: leitura/gravação acontecem no dispositivo; o backend só registra
    // a transação resultante (pagamento ou recebimento) como qualquer outra.
    if(action === 'transacaoNfc') return _json({ok:true, ...registrarTransacaoNfc(body)});

    // Open Finance (Pluggy)
    if(action === 'pluggyConnectToken') return _json(gerarPluggyConnectToken());
    if(action === 'pluggySync') return _json(sincronizarPluggyItem(body.itemId));
    if(action === 'pluggyDesconectar'){ desconectarItemOF(body.itemId); return _json({ok:true}); }

    return _json({ok:false, error:'Ação desconhecida: ' + action});
  }catch(err){
    return _json({ok:false, error:String(err)});
  }
}

/* ------------------------------------------------------------------ */
/* Registrar compra (lista, checkout, nota fiscal ou pagamento NFC)    */
/* ------------------------------------------------------------------ */
function registrarCompra(payload){
  const sh = _sheet(SHEET_COMPRAS);
  const purchaseId = payload.purchaseId || Utilities.getUuid();
  const data = payload.date || Utilities.formatDate(new Date(), 'GMT-3', 'yyyy-MM-dd');
  const hora = payload.time || Utilities.formatDate(new Date(), 'GMT-3', 'HH:mm:ss');
  const local = payload.location && payload.location.lat
    ? `${payload.location.lat.toFixed(5)}, ${payload.location.lng.toFixed(5)}`
    : 'Não informado';
  const formaPagamento = payload.paymentMethod || 'Não informado';

  const categorias = getCategorias();
  const grupoPorCategoria = {};
  categorias.forEach(c => grupoPorCategoria[c.categoria] = c.grupo || 'Necessidade');

  const items = payload.items || [];
  items.forEach(function(item){
    const qtd = Number(item.qty) || 1;
    const precoUnit = Number(item.price) || 0;
    const subtotal = qtd * precoUnit;
    const naLista = item.inList !== false;
    const categoria = item.category || 'Outros';
    const grupo = grupoPorCategoria[categoria] || 'Necessidade';
    sh.appendRow([
      data, hora, local, purchaseId,
      item.name || '(sem nome)', categoria,
      qtd, precoUnit, subtotal, formaPagamento, naLista, grupo
    ]);
  });

  const lastRow = sh.getLastRow();
  const numNovas = items.length;
  for(let i=0; i<numNovas; i++){
    const r = lastRow - numNovas + 1 + i;
    const naLista = items[i].inList !== false;
    if(!naLista){ sh.getRange(r, 1, 1, 12).setFontColor('#D6483B'); }
  }

  if(payload.contaId){ ajustarSaldoConta(payload.contaId, -somaItens(items)); }
}
function somaItens(items){ return (items||[]).reduce((s,i)=> s + (Number(i.qty)||1)*(Number(i.price)||0), 0); }

/* ------------------------------------------------------------------ */
/* Categorias / grupos (para a regra 50-30-20)                         */
/* ------------------------------------------------------------------ */
function getCategorias(){
  const sh = _sheet(SHEET_CATEGORIAS);
  const values = sh.getDataRange().getValues();
  const out = [];
  for(let i=1; i<values.length; i++){
    const [nome, orcamento, grupo] = values[i];
    if(!nome) continue;
    out.push({categoria:String(nome), orcamento:Number(orcamento)||0, grupo: grupo || 'Necessidade'});
  }
  return out;
}
function salvarCategorias(categorias){
  const sh = _sheet(SHEET_CATEGORIAS);
  sh.clearContents();
  sh.appendRow(['Categoria', 'Orçamento Mensal (R$)', 'Grupo (50-30-20)']);
  categorias.forEach(c => sh.appendRow([c.n, c.v, c.g || 'Necessidade']));
}
function salvarListaSimples(sheetName, itens){
  const sh = _sheet(sheetName);
  sh.clearContents();
  sh.appendRow(['Nome', 'Valor Mensal (R$)']);
  itens.forEach(i => sh.appendRow([i.n, i.v]));
}
function somaListaSimples(sheetName){
  try{
    const sh = _sheet(sheetName);
    const values = sh.getDataRange().getValues();
    let total = 0;
    for(let i=1; i<values.length; i++){ total += Number(values[i][1]) || 0; }
    return total;
  }catch(e){ return 0; }
}

/* ------------------------------------------------------------------ */
/* Resumo mensal (alerta de orçamento por categoria)                   */
/* ------------------------------------------------------------------ */
function getResumoMensal(mesNumero){
  const categorias = getCategorias();
  const shCompras = _sheet(SHEET_COMPRAS);
  const dados = shCompras.getDataRange().getValues();
  const gastosPorCategoria = {};
  categorias.forEach(c => gastosPorCategoria[c.categoria] = 0);

  for(let i=1; i<dados.length; i++){
    const row = dados[i];
    const dataStr = row[0];
    if(!dataStr) continue;
    const d = (dataStr instanceof Date) ? dataStr : new Date(dataStr);
    if(isNaN(d)) continue;
    if((d.getMonth()+1) !== Number(mesNumero)) continue;
    const categoria = row[5] || 'Outros';
    const subtotal = Number(row[8]) || 0;
    gastosPorCategoria[categoria] = (gastosPorCategoria[categoria]||0) + subtotal;
  }

  const categoriasResumo = categorias.map(c=>{
    const gasto = gastosPorCategoria[c.categoria] || 0;
    return {
      categoria: c.categoria, orcamento: c.orcamento,
      gasto: Math.round(gasto*100)/100,
      excedido: c.orcamento>0 && gasto>c.orcamento
    };
  });

  const alertas = categoriasResumo.filter(c=>c.excedido);
  return { categorias: categoriasResumo, alertas };
}

/* ------------------------------------------------------------------ */
/* Painel por período com a regra 50-30-20 + contas conectadas         */
/* ------------------------------------------------------------------ */
function getPainelPeriodo(periodo){
  const categorias = getCategorias();
  const hoje = new Date();

  const receitaMensal = somaListaSimples(SHEET_PROVENTOS_APP);
  let receita = receitaMensal;
  if(periodo === 'dia') receita = receitaMensal / 30;
  if(periodo === 'ano') receita = receitaMensal * 12;

  const shCompras = _sheet(SHEET_COMPRAS);
  const dados = shCompras.getDataRange().getValues();
  const gastosPorCategoria = {};
  categorias.forEach(c => gastosPorCategoria[c.categoria] = 0);

  for(let i=1; i<dados.length; i++){
    const row = dados[i];
    const dataStr = row[0];
    if(!dataStr) continue;
    const d = (dataStr instanceof Date) ? dataStr : new Date(dataStr);
    if(isNaN(d)) continue;

    let dentroPeriodo = false;
    if(periodo === 'dia') dentroPeriodo = d.toDateString() === hoje.toDateString();
    else if(periodo === 'ano') dentroPeriodo = d.getFullYear() === hoje.getFullYear();
    else dentroPeriodo = (d.getMonth()+1) === (hoje.getMonth()+1) && d.getFullYear() === hoje.getFullYear();
    if(!dentroPeriodo) continue;

    const categoria = row[5] || 'Outros';
    const subtotal = Number(row[8]) || 0;
    gastosPorCategoria[categoria] = (gastosPorCategoria[categoria]||0) + subtotal;
  }

  const grupos = {Necessidade:0, Desejo:0, Investimento:0};
  categorias.forEach(c=>{
    const g = c.grupo || 'Necessidade';
    grupos[g] = (grupos[g]||0) + (gastosPorCategoria[c.categoria]||0);
  });

  const metas = { Necessidade: receita*0.5, Desejo: receita*0.3, Investimento: receita*0.2 };
  const gruposArr = Object.keys(grupos).map(g=>({grupo:g, gasto:Math.round(grupos[g]*100)/100, meta:Math.round(metas[g]*100)/100}));

  const gastoTotal = Object.values(grupos).reduce((s,v)=>s+v,0);
  const saldoLivre = Math.round((receita - gastoTotal)*100)/100;

  const resumoCategorias = getResumoMensal(hoje.getMonth()+1);

  let saldoContas = 0;
  try{ saldoContas = listarContas().reduce((s,c)=> s + (Number(c.saldo)||0), 0); }catch(e){}
  let proximasContas = [];
  try{ proximasContas = listarContasPagar().filter(c=>!c.pago).sort((a,b)=> new Date(a.vencimento) - new Date(b.vencimento)).slice(0,5); }catch(e){}
  let metasResumo = [];
  try{ metasResumo = listarMetas(); }catch(e){}

  return {
    periodo, receita: Math.round(receita*100)/100, gastoTotal: Math.round(gastoTotal*100)/100,
    saldoLivre, grupos: gruposArr, alertas: resumoCategorias.alertas,
    saldoContas: Math.round(saldoContas*100)/100, proximasContas, metas: metasResumo
  };
}

/* ------------------------------------------------------------------ */
/* Contas e Cartões                                                    */
/* ------------------------------------------------------------------ */
function listarContas(){ return _rowsToObjects(_sheet(SHEET_CONTAS)).map(normalizarConta); }
function normalizarConta(r){
  return {id:String(r.ID), nome:r.Nome, tipo:r.Tipo, instituicao:r.Instituicao, saldo:Number(r.Saldo)||0, origem:r.Origem||'Manual', itemId:r.ItemId||'', atualizadoEm:r.AtualizadoEm};
}
function salvarConta(c){
  const sh = _sheet(SHEET_CONTAS);
  const agora = new Date();
  if(c.id){
    const row = _findRowById(sh, c.id);
    if(row > 0){
      sh.getRange(row,1,1,8).setValues([[c.id, c.nome, c.tipo, c.instituicao||'', Number(c.saldo)||0, c.origem||'Manual', agora, c.itemId||'']]);
      return normalizarConta({ID:c.id, Nome:c.nome, Tipo:c.tipo, Instituicao:c.instituicao, Saldo:c.saldo, Origem:c.origem, ItemId:c.itemId, AtualizadoEm:agora});
    }
  }
  const id = c.id || Utilities.getUuid();
  sh.appendRow([id, c.nome, c.tipo, c.instituicao||'', Number(c.saldo)||0, c.origem||'Manual', agora, c.itemId||'']);
  return normalizarConta({ID:id, Nome:c.nome, Tipo:c.tipo, Instituicao:c.instituicao, Saldo:c.saldo, Origem:c.origem, ItemId:c.itemId, AtualizadoEm:agora});
}
function ajustarSaldoConta(contaId, delta){
  const sh = _sheet(SHEET_CONTAS);
  const row = _findRowById(sh, contaId);
  if(row < 0) return;
  const atual = Number(sh.getRange(row,5).getValue())||0;
  sh.getRange(row,5).setValue(atual + delta);
  sh.getRange(row,7).setValue(new Date());
}
function excluirLinha(sheetName, id){
  const sh = _sheet(sheetName);
  const row = _findRowById(sh, id);
  if(row > 0) sh.deleteRow(row);
}

function listarCartoes(){ return _rowsToObjects(_sheet(SHEET_CARTOES)).map(r=>({id:String(r.ID), nome:r.Nome, instituicao:r.Instituicao, limite:Number(r.Limite)||0, diaFechamento:Number(r.DiaFechamento)||1, diaVencimento:Number(r.DiaVencimento)||10, faturaAtual:Number(r.FaturaAtual)||0, origem:r.Origem||'Manual'})); }
function salvarCartao(c){
  const sh = _sheet(SHEET_CARTOES);
  if(c.id){
    const row = _findRowById(sh, c.id);
    if(row > 0){
      sh.getRange(row,1,1,7).setValues([[c.id, c.nome, c.instituicao||'', Number(c.limite)||0, Number(c.diaFechamento)||1, Number(c.diaVencimento)||10, Number(c.faturaAtual)||0]]);
      return {id:c.id, ...c};
    }
  }
  const id = c.id || Utilities.getUuid();
  sh.appendRow([id, c.nome, c.instituicao||'', Number(c.limite)||0, Number(c.diaFechamento)||1, Number(c.diaVencimento)||10, Number(c.faturaAtual)||0]);
  return {id, ...c};
}

/* ------------------------------------------------------------------ */
/* Contas a pagar                                                       */
/* ------------------------------------------------------------------ */
function listarContasPagar(){ return _rowsToObjects(_sheet(SHEET_CONTAS_PAGAR)).map(r=>({id:String(r.ID), descricao:r.Descricao, categoria:r.Categoria, valor:Number(r.Valor)||0, vencimento:r.Vencimento, recorrente:r.Recorrente||'unica', pago:!!r.Pago, dataPagamento:r.DataPagamento||''})); }
function salvarContaPagar(item){
  const sh = _sheet(SHEET_CONTAS_PAGAR);
  if(item.id){
    const row = _findRowById(sh, item.id);
    if(row > 0){
      sh.getRange(row,1,1,8).setValues([[item.id, item.descricao, item.categoria||'Outros', Number(item.valor)||0, item.vencimento, item.recorrente||'unica', !!item.pago, item.dataPagamento||'']]);
      return item;
    }
  }
  const id = item.id || Utilities.getUuid();
  sh.appendRow([id, item.descricao, item.categoria||'Outros', Number(item.valor)||0, item.vencimento, item.recorrente||'unica', false, '']);
  return {id, ...item};
}
function marcarContaPagarPaga(id, contaId){
  const sh = _sheet(SHEET_CONTAS_PAGAR);
  const row = _findRowById(sh, id);
  if(row < 0) throw new Error('Conta a pagar não encontrada.');
  const dataPagamento = Utilities.formatDate(new Date(), 'GMT-3', 'yyyy-MM-dd');
  sh.getRange(row,7).setValue(true);
  sh.getRange(row,8).setValue(dataPagamento);
  const valores = sh.getRange(row,1,1,6).getValues()[0];
  const descricao = valores[1], categoria = valores[2], valor = Number(valores[3])||0, recorrente = valores[5];

  registrarCompra({
    purchaseId: Utilities.getUuid(), date: dataPagamento, paymentMethod: 'Conta a pagar', contaId: contaId||'',
    items:[{name:descricao, category:categoria, qty:1, price:valor, inList:true}]
  });

  if(recorrente === 'mensal'){
    const venc = new Date(valores[4]);
    const prox = new Date(venc.getFullYear(), venc.getMonth()+1, venc.getDate());
    sh.appendRow([Utilities.getUuid(), descricao, categoria, valor, prox, 'mensal', false, '']);
  }
  return {id, pago:true, dataPagamento};
}

/* ------------------------------------------------------------------ */
/* Metas                                                                */
/* ------------------------------------------------------------------ */
function listarMetas(){ return _rowsToObjects(_sheet(SHEET_METAS)).map(r=>({id:String(r.ID), nome:r.Nome, valorAlvo:Number(r.ValorAlvo)||0, valorAtual:Number(r.ValorAtual)||0, prazo:r.Prazo||'', icone:r.Icone||'🎯'})); }
function salvarMeta(item){
  const sh = _sheet(SHEET_METAS);
  if(item.id){
    const row = _findRowById(sh, item.id);
    if(row > 0){
      sh.getRange(row,1,1,6).setValues([[item.id, item.nome, Number(item.valorAlvo)||0, Number(item.valorAtual)||0, item.prazo||'', item.icone||'🎯']]);
      return item;
    }
  }
  const id = item.id || Utilities.getUuid();
  sh.appendRow([id, item.nome, Number(item.valorAlvo)||0, Number(item.valorAtual)||0, item.prazo||'', item.icone||'🎯']);
  return {id, ...item};
}
function aportarMeta(id, valor){
  const sh = _sheet(SHEET_METAS);
  const row = _findRowById(sh, id);
  if(row < 0) throw new Error('Meta não encontrada.');
  const atual = Number(sh.getRange(row,4).getValue())||0;
  const novo = atual + valor;
  sh.getRange(row,4).setValue(novo);
  if(valor > 0){
    registrarCompra({ purchaseId:Utilities.getUuid(), paymentMethod:'Aporte meta',
      items:[{name:'Aporte: '+sh.getRange(row,2).getValue(), category:'Investimentos', qty:1, price:valor, inList:true}] });
  }
  return {id, valorAtual:novo};
}

/* ------------------------------------------------------------------ */
/* NFC — o backend só registra o resultado da leitura/gravação feita   */
/* no aparelho (Web NFC). Pagamento = despesa; recebimento = receita.   */
/* ------------------------------------------------------------------ */
function registrarTransacaoNfc(body){
  if(body.tipo === 'pagamento'){
    registrarCompra({
      purchaseId: Utilities.getUuid(), paymentMethod: 'NFC', contaId: body.contaId||'',
      items:[{name:body.descricao||'Pagamento por NFC', category:body.categoria||'Outros', qty:1, price:Number(body.valor)||0, inList:true}]
    });
    return {registrado:true};
  }
  if(body.tipo === 'recebimento'){
    if(body.contaId) ajustarSaldoConta(body.contaId, Number(body.valor)||0);
    const sh = _sheet(SHEET_TRANSACOES);
    sh.appendRow([Utilities.getUuid(), new Date(), 'Receita', body.descricao||'Recebimento por NFC', 'NFC', Number(body.valor)||0, body.contaId||'']);
    return {registrado:true};
  }
  return {registrado:false};
}

/* ------------------------------------------------------------------ */
/* Open Finance — Pluggy                                               */
/* Documentação: https://docs.pluggy.ai                                */
/* ------------------------------------------------------------------ */
function pluggyConfigurado(){
  const p = PropertiesService.getScriptProperties();
  return !!(p.getProperty('PLUGGY_CLIENT_ID') && p.getProperty('PLUGGY_CLIENT_SECRET'));
}
function pluggyApiKey_(){
  const p = PropertiesService.getScriptProperties();
  const clientId = p.getProperty('PLUGGY_CLIENT_ID');
  const clientSecret = p.getProperty('PLUGGY_CLIENT_SECRET');
  if(!clientId || !clientSecret) throw new Error('Pluggy não configurado. Veja as instruções no topo do Code.gs.');
  const resp = UrlFetchApp.fetch(PLUGGY_API + '/auth', {
    method:'post', contentType:'application/json',
    payload: JSON.stringify({clientId, clientSecret})
  });
  return JSON.parse(resp.getContentText()).apiKey;
}
function gerarPluggyConnectToken(){
  if(!pluggyConfigurado()) return {ok:false, error:'Pluggy não configurado no backend. Veja instruções no Code.gs.'};
  const apiKey = pluggyApiKey_();
  const resp = UrlFetchApp.fetch(PLUGGY_API + '/connect_token', {
    method:'post', contentType:'application/json', headers:{'X-API-KEY':apiKey},
    payload: JSON.stringify({})
  });
  const data = JSON.parse(resp.getContentText());
  return {ok:true, connectToken:data.connectToken};
}
function sincronizarPluggyItem(itemId){
  if(!itemId) return {ok:false, error:'itemId ausente.'};
  const apiKey = pluggyApiKey_();
  const headers = {'X-API-KEY':apiKey};

  const itemResp = UrlFetchApp.fetch(PLUGGY_API + '/items/' + itemId, {headers});
  const item = JSON.parse(itemResp.getContentText());
  const instituicao = item.connector ? item.connector.name : 'Banco conectado';

  const accResp = UrlFetchApp.fetch(PLUGGY_API + '/accounts?itemId=' + itemId, {headers});
  const accounts = JSON.parse(accResp.getContentText()).results || [];

  const contasSalvas = [];
  accounts.forEach(acc=>{
    const conta = salvarConta({
      id: 'pluggy_' + acc.id, nome: acc.name || instituicao, tipo: acc.type || 'Corrente',
      instituicao, saldo: acc.balance || 0, origem:'OpenFinance', itemId
    });
    contasSalvas.push(conta);

    try{
      const txResp = UrlFetchApp.fetch(PLUGGY_API + '/transactions?accountId=' + acc.id + '&pageSize=50', {headers});
      const txs = JSON.parse(txResp.getContentText()).results || [];
      const shCompras = _sheet(SHEET_COMPRAS);
      const existentes = new Set(shCompras.getDataRange().getValues().map(r=>String(r[3])));
      txs.forEach(tx=>{
        const pid = 'pluggy_' + tx.id;
        if(existentes.has(pid)) return;
        const valor = Math.abs(Number(tx.amount)||0);
        const categoria = tx.category || 'Outros';
        shCompras.appendRow([
          Utilities.formatDate(new Date(tx.date), 'GMT-3', 'yyyy-MM-dd'), '', 'Open Finance', pid,
          tx.description || 'Transação', categoria, 1, valor, valor,
          instituicao, true, 'Necessidade'
        ]);
      });
    }catch(e){ /* segue sem travar a sincronização de outras contas */ }
  });

  salvarConexaoOF(itemId, instituicao);
  return {ok:true, contas:contasSalvas};
}
function listarConexoesOF(){
  try{ return _rowsToObjects(_sheet(SHEET_OF_CONEXOES)); }catch(e){ return []; }
}
function salvarConexaoOF(itemId, instituicao){
  const sh = _sheet(SHEET_OF_CONEXOES);
  const row = _findRowById(sh, itemId);
  if(row > 0){ sh.getRange(row,3).setValue(new Date()); return; }
  sh.appendRow([itemId, instituicao, new Date()]);
}
function desconectarItemOF(itemId){
  excluirLinha(SHEET_OF_CONEXOES, itemId);
  const sh = _sheet(SHEET_CONTAS);
  const values = sh.getDataRange().getValues();
  for(let i=values.length-1;i>=1;i--){
    if(String(values[i][7]) === String(itemId)) sh.deleteRow(i+1);
  }
}

/* ------------------------------------------------------------------ */
/* Configuração inicial (rodar uma vez pelo editor do Apps Script)     */
/* ------------------------------------------------------------------ */
function configurarPlanilhaInicial(){
  const ss = _ss();

  if(!ss.getSheetByName(SHEET_COMPRAS)){
    const sh = ss.insertSheet(SHEET_COMPRAS);
    sh.appendRow(['Data','Hora','Localização','ID Compra','Item','Categoria','Qtd','Preço Unit.','Subtotal','Forma Pagamento','Na Lista','Grupo (50-30-20)']);
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_CATEGORIAS)){
    const sh = ss.insertSheet(SHEET_CATEGORIAS);
    sh.appendRow(['Categoria','Orçamento Mensal (R$)','Grupo (50-30-20)']);
    const defaults = [
      ['Alimentação', 800, 'Necessidade'], ['Transporte', 200, 'Necessidade'],
      ['Contas Fixas', 1900, 'Necessidade'], ['Assinaturas', 100, 'Desejo'],
      ['Lazer', 150, 'Desejo'], ['Saúde', 150, 'Necessidade'],
      ['Vestuário', 100, 'Desejo'], ['Cartão de Crédito', 500, 'Desejo'],
      ['Investimentos', 200, 'Investimento'], ['Outros', 100, 'Desejo']
    ];
    defaults.forEach(r => sh.appendRow(r));
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_CUSTOS_APP)){
    const sh = ss.insertSheet(SHEET_CUSTOS_APP);
    sh.appendRow(['Nome','Valor Mensal (R$)']);
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_PROVENTOS_APP)){
    const sh = ss.insertSheet(SHEET_PROVENTOS_APP);
    sh.appendRow(['Nome','Valor Mensal (R$)']);
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_CONTAS)){
    const sh = ss.insertSheet(SHEET_CONTAS);
    sh.appendRow(['ID','Nome','Tipo','Instituicao','Saldo','Origem','AtualizadoEm','ItemId']);
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_CARTOES)){
    const sh = ss.insertSheet(SHEET_CARTOES);
    sh.appendRow(['ID','Nome','Instituicao','Limite','DiaFechamento','DiaVencimento','FaturaAtual']);
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_CONTAS_PAGAR)){
    const sh = ss.insertSheet(SHEET_CONTAS_PAGAR);
    sh.appendRow(['ID','Descricao','Categoria','Valor','Vencimento','Recorrente','Pago','DataPagamento']);
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_METAS)){
    const sh = ss.insertSheet(SHEET_METAS);
    sh.appendRow(['ID','Nome','ValorAlvo','ValorAtual','Prazo','Icone']);
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_TRANSACOES)){
    const sh = ss.insertSheet(SHEET_TRANSACOES);
    sh.appendRow(['ID','Data','Tipo','Descricao','Origem','Valor','ContaId']);
    sh.setFrozenRows(1);
  }

  if(!ss.getSheetByName(SHEET_OF_CONEXOES)){
    const sh = ss.insertSheet(SHEET_OF_CONEXOES);
    sh.appendRow(['ItemId','Instituicao','ConectadoEm']);
    sh.setFrozenRows(1);
  }
}
