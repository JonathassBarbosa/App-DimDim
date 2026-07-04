/**
 * DIMDIM — Backend (Google Apps Script)
 * -----------------------------------------------------------
 * Transforma sua Planilha Google em uma API HTTPS gratuita para o app dimdim.
 *
 * COMO IMPLANTAR:
 * 1. Na planilha: Extensões > Apps Script.
 * 2. Apague o conteúdo do Code.gs padrão e cole este arquivo inteiro.
 * 3. Rode a função "configurarPlanilhaInicial" uma vez (menu suspenso no topo > Executar).
 * 4. Implantar > Nova implantação > tipo "App da Web".
 *    Executar como: Eu. Quem pode acessar: Qualquer pessoa.
 * 5. Copie a URL (termina em /exec) e cole no app, na tela Registro.
 * 6. Ao editar este script, gere uma NOVA versão em "Gerenciar implantações" para valer.
 */

const SHEET_COMPRAS = 'Compras';
const SHEET_CATEGORIAS = 'Categorias_Config';
const SHEET_CUSTOS_APP = 'Custos_Fixos_App';
const SHEET_PROVENTOS_APP = 'Proventos_App';
const SHEET_CUSTOS_ORIGINAL = 'Planilha1';

function _ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function _sheet(name){
  const sh = _ss().getSheetByName(name);
  if(!sh) throw new Error('Aba não encontrada: ' + name);
  return sh;
}
function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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
    return _json({ok:false, error:'Ação desconhecida: ' + action});
  }catch(err){
    return _json({ok:false, error:String(err)});
  }
}

/* ------------------------------------------------------------------ */
/* Registrar compra (lista, checkout ou nota fiscal)                   */
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

  // destaca em vermelho as linhas de itens que vieram fora da lista
  const lastRow = sh.getLastRow();
  const numNovas = items.length;
  for(let i=0; i<numNovas; i++){
    const r = lastRow - numNovas + 1 + i;
    const naLista = items[i].inList !== false;
    const range = sh.getRange(r, 1, 1, 12);
    if(!naLista){
      range.setFontColor('#D6483B');
    }
  }
}

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
/* Resumo mensal (usado no fluxo de alerta de orçamento por categoria) */
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
/* Painel por período com a regra 50-30-20                             */
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

  return {
    periodo, receita: Math.round(receita*100)/100, gastoTotal: Math.round(gastoTotal*100)/100,
    saldoLivre, grupos: gruposArr, alertas: resumoCategorias.alertas
  };
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
      ['Outros', 100, 'Desejo']
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
}
