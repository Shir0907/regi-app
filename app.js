/* =========================================================
   こレジ — POSロジック
   保存: localStorage / 単一ファイルSPA
   ========================================================= */
'use strict';

/* ---------- 0. ユーティリティ ---------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const yen = n => '¥' + Math.round(n).toLocaleString('ja-JP');
const uid = ()=> Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const todayStr = (d=new Date())=>{
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
};
const fmtDT = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'), 2000);
}

/* ---------- 1. ストレージ層 ---------- */
const KEY = 'kore-regi-v1';

const defaultData = ()=>({
  settings:{
    shop:'こレジ サンプル店', addr:'', tel:'', invoice:'',
    taxMode:'incl',         // 'incl' 内税 / 'excl' 外税
    defaultRate:10,         // 0/8/10
    round:'floor',          // floor/round/ceil
    rcHeader:'いつもありがとうございます',
    rcFooter:'またのご来店をお待ちしております',
    rcLogo:true,
    paymentMethods:[
      {id:'cash',     name:'現金',         enabled:true},
      {id:'credit',   name:'クレジット',   enabled:true},
      {id:'emoney',   name:'電子マネー',   enabled:true},
      {id:'qr',       name:'QRコード決済', enabled:true},
      {id:'transport',name:'交通系IC',     enabled:false},
      {id:'other',    name:'その他',       enabled:false},
    ],
  },
  cats:[],
  products:[],
  txns:[],         // 取引履歴
  holds:[],        // 一時保存伝票
  settlements:[],  // 精算履歴
  floatMoney:0,    // つり銭準備金
  ticketSeq: 1001,
});

let DB = load();
function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaultData();
    const d = JSON.parse(raw);
    // マイグレーション: 欠損キーを補う
    const base = defaultData();
    return {...base, ...d, settings:{...base.settings, ...(d.settings||{})}};
  }catch(e){
    return defaultData();
  }
}
function save(){ localStorage.setItem(KEY, JSON.stringify(DB)); }

/* ---------- 2. 画面遷移 ---------- */
function nav(name){
  $$('.screen').forEach(s=>s.classList.toggle('active', s.dataset.screen===name));
  $$('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.nav===name));
  // 画面別の初期化
  if(name==='home')     renderHome();
  if(name==='order')    renderOrderScreen();
  if(name==='products') renderProducts();
  if(name==='sales')    renderSales();
  if(name==='register') renderRegister();
  if(name==='history')  renderHistory();
  if(name==='settings') renderSettings();
}

document.addEventListener('click', e=>{
  const navEl = e.target.closest('[data-nav]');
  if(navEl){ nav(navEl.dataset.nav); }
  const closeEl = e.target.closest('[data-close]');
  if(closeEl){ closeEl.closest('.modal')?.classList.remove('show'); }
});

/* ---------- 3. ホーム ---------- */
function renderHome(){
  $('#shopName').textContent = DB.settings.shop || 'お店';
  const t = todayStr();
  const todays = DB.txns.filter(x=>x.date===t && x.type==='sale');
  const refunds = DB.txns.filter(x=>x.date===t && x.type==='refund');
  const total = todays.reduce((a,b)=>a+b.total,0) + refunds.reduce((a,b)=>a+b.total,0);
  $('#homeTodaySales').textContent = yen(total);
  $('#homeTodayCount').textContent = todays.length;
  $('#homeProductCount').textContent = DB.products.length;
  $('#homeHoldCount').textContent = DB.holds.length;
}

/* ---------- 4. 商品・カテゴリー ---------- */
function renderProducts(){
  // 商品テーブル
  const search = $('#productSearch').value.trim();
  const filterCat = $('#productFilterCat').value;
  // カテゴリーフィルタ更新
  const sel = $('#productFilterCat');
  const prev = sel.value;
  sel.innerHTML = '<option value="">すべてのカテゴリー</option>' +
    DB.cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  sel.value = prev;

  const tb = $('#productTbody'); tb.innerHTML='';
  DB.products
    .filter(p=>!search || p.name.includes(search))
    .filter(p=>!filterCat || p.catId===filterCat)
    .forEach(p=>{
      const cat = DB.cats.find(c=>c.id===p.catId);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="color-swatch" style="background:${cat?.color||'#ccc'}"></span>${cat?.name||'未分類'}</td>
        <td>${escapeHtml(p.name)}${p.dept?'<span class="pt-flag" style="position:static;margin-left:6px">部</span>':''}</td>
        <td class="num">${p.dept?'部門打ち':p.price===0?'0円':yen(p.price)}</td>
        <td>${taxLabel(p.tax)}</td>
        <td class="num">${p.stock===null||p.stock===undefined?'-':p.stock}</td>
        <td>${(p.variations||[]).join(', ')}</td>
        <td class="row-act"><button class="mini-btn" data-edit-prod="${p.id}">編集</button></td>
      `;
      tb.appendChild(tr);
    });

  // カテゴリーカード
  const cl = $('#catList'); cl.innerHTML='';
  DB.cats.forEach(c=>{
    const count = DB.products.filter(p=>p.catId===c.id).length;
    const div = document.createElement('div');
    div.className='cat-card';
    div.innerHTML = `
      <div class="swatch" style="background:${c.color}"></div>
      <div class="info">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="meta">${count}商品 / ${c.staff?'担当: '+escapeHtml(c.staff):'担当未設定'}</div>
      </div>`;
    div.addEventListener('click', ()=>openCatModal(c.id));
    cl.appendChild(div);
  });
}

function taxLabel(tax){
  if(tax==='ask') return '注文時';
  if(tax==0) return '非課税 0%';
  if(tax==8) return '軽減 8%';
  if(tax==10) return '標準 10%';
  return tax+'%';
}

function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// 商品タブ切替
$$('[data-ptab]').forEach(el=>{
  el.addEventListener('click', e=>{
    if(el.classList.contains('tab')){
      $$('[data-ptab].tab').forEach(b=>b.classList.toggle('on', b===el));
      $$('.ptab').forEach(p=>p.style.display = p.dataset.ptab===el.dataset.ptab?'':'none');
    }
  });
});

/* --- 商品モーダル --- */
let editingProductId = null;
function openProductModal(id){
  editingProductId = id;
  const p = id ? DB.products.find(x=>x.id===id) : null;
  $('#prodModalTitle').textContent = p?'商品を編集':'商品を登録';
  $('#pmName').value = p?.name || '';
  $('#pmPrice').value = p?.price ?? '';
  $('#pmTax').value = p?.tax ?? DB.settings.defaultRate;
  $('#pmStock').value = p?.stock ?? '';
  $('#pmBarcode').value = p?.barcode || '';
  $('#pmVariations').value = (p?.variations||[]).join(',');
  $('#pmDept').checked = !!p?.dept;
  $('#pmColor').value = p?.color || '#69F0D9';
  const catSel = $('#pmCat');
  catSel.innerHTML = '<option value="">未分類</option>' + DB.cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  catSel.value = p?.catId || '';
  $('#pmDelete').style.display = p?'':'none';
  $('#modalProduct').classList.add('show');
}
$('#btnAddProduct').addEventListener('click', ()=>openProductModal());
$('#pmSave').addEventListener('click', ()=>{
  const name = $('#pmName').value.trim();
  if(!name){ toast('商品名を入力してください'); return; }
  const dept = $('#pmDept').checked;
  const price = dept ? 0 : (Number($('#pmPrice').value)||0);
  const stockVal = $('#pmStock').value;
  const obj = {
    id: editingProductId || uid(),
    name, price, dept,
    tax: $('#pmTax').value==='ask' ? 'ask' : Number($('#pmTax').value),
    stock: stockVal===''?null:Number(stockVal),
    barcode: $('#pmBarcode').value.trim(),
    variations: $('#pmVariations').value.split(',').map(s=>s.trim()).filter(Boolean),
    catId: $('#pmCat').value || null,
    color: $('#pmColor').value,
  };
  if(editingProductId){
    DB.products = DB.products.map(p=>p.id===editingProductId?obj:p);
  }else{
    DB.products.push(obj);
  }
  save();
  $('#modalProduct').classList.remove('show');
  renderProducts();
  toast('保存しました');
});
$('#pmDelete').addEventListener('click', ()=>{
  if(!editingProductId) return;
  if(!confirm('この商品を削除しますか？')) return;
  DB.products = DB.products.filter(p=>p.id!==editingProductId);
  save();
  $('#modalProduct').classList.remove('show');
  renderProducts();
});
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-edit-prod]');
  if(b) openProductModal(b.dataset.editProd);
});

/* --- カテゴリーモーダル --- */
let editingCatId = null;
function openCatModal(id){
  editingCatId = id;
  const c = id ? DB.cats.find(x=>x.id===id) : null;
  $('#catModalTitle').textContent = c?'カテゴリーを編集':'カテゴリーを登録';
  $('#cmName').value = c?.name || '';
  $('#cmColor').value = c?.color || '#69F0D9';
  $('#cmStaff').value = c?.staff || '';
  $('#cmDelete').style.display = c?'':'none';
  $('#modalCat').classList.add('show');
}
$('#btnAddCat').addEventListener('click', ()=>openCatModal());
$('#cmSave').addEventListener('click', ()=>{
  const name = $('#cmName').value.trim();
  if(!name){ toast('カテゴリー名を入力してください'); return; }
  const obj = {
    id: editingCatId || uid(),
    name, color: $('#cmColor').value, staff: $('#cmStaff').value.trim(),
  };
  if(editingCatId){
    DB.cats = DB.cats.map(c=>c.id===editingCatId?obj:c);
  }else{
    DB.cats.push(obj);
  }
  save();
  $('#modalCat').classList.remove('show');
  renderProducts();
});
$('#cmDelete').addEventListener('click', ()=>{
  if(!editingCatId) return;
  if(!confirm('このカテゴリーを削除しますか？（商品は未分類になります）')) return;
  DB.products = DB.products.map(p=>p.catId===editingCatId?{...p,catId:null}:p);
  DB.cats = DB.cats.filter(c=>c.id!==editingCatId);
  save();
  $('#modalCat').classList.remove('show');
  renderProducts();
});

/* ---------- 5. 注文入力・会計 ---------- */
let CART = {
  ticketNo: null,
  items: [],   // {id, productId, name, price, qty, tax, isDept, variation, refund}
  ticket: {people:1, table:'', customer:'', memo:''},
  discount: {type:'none', value:0},
  filterCat: null,
};

function newCart(){
  CART = {
    ticketNo: 'T'+(DB.ticketSeq++),
    items: [],
    ticket: {people:1, table:'', customer:'', memo:''},
    discount: {type:'none', value:0},
    filterCat: CART.filterCat,
  };
  save();
}

function renderOrderScreen(){
  if(!CART.ticketNo) newCart();
  // カテゴリーバー
  const cb = $('#catBar'); cb.innerHTML='';
  const all = document.createElement('div');
  all.className = 'cat-chip' + (CART.filterCat===null?' on':'');
  all.textContent = 'すべて';
  all.addEventListener('click', ()=>{CART.filterCat=null;renderOrderScreen();});
  cb.appendChild(all);
  DB.cats.forEach(c=>{
    const chip = document.createElement('div');
    chip.className = 'cat-chip' + (CART.filterCat===c.id?' on':'');
    chip.innerHTML = `<span class="dot" style="background:${c.color}"></span>${escapeHtml(c.name)}`;
    chip.addEventListener('click', ()=>{CART.filterCat=c.id;renderOrderScreen();});
    cb.appendChild(chip);
  });

  // 商品グリッド
  const pg = $('#productGrid'); pg.innerHTML='';
  const list = DB.products.filter(p=>!CART.filterCat || p.catId===CART.filterCat);
  $('#productEmpty').style.display = DB.products.length===0?'':'none';
  list.forEach(p=>{
    const cat = DB.cats.find(c=>c.id===p.catId);
    const tile = document.createElement('div');
    tile.className = 'product-tile';
    const stockStr = (p.stock!==null&&p.stock!==undefined)?`在庫: ${p.stock}`:'';
    const tint = (p.color || cat?.color || '#69F0D9') + '22';
    tile.style.background = `linear-gradient(180deg,${tint} 0%, #fff 60%)`;
    tile.innerHTML = `
      ${p.dept?'<div class="pt-flag">部</div>':''}
      <div class="pt-name">${escapeHtml(p.name)}</div>
      <div class="pt-price">${p.dept?'部門打ち':yen(p.price)}</div>
      ${stockStr?`<div class="pt-stock">${stockStr}</div>`:''}
    `;
    if(p.stock===0){ tile.classList.add('disabled'); }
    else tile.addEventListener('click', ()=>addToCart(p));
    pg.appendChild(tile);
  });

  renderCart();
}

function addToCart(p, opts={}){
  // バリエーション
  if(p.variations && p.variations.length && !opts.variation){
    openVariationPicker(p);
    return;
  }
  // 部門打ち or 0円商品（注文時に価格入力）
  if(p.dept || p.price===0){
    openDeptKeypad(p, opts.variation);
    return;
  }
  // 税率「注文時に選択」
  if(p.tax === 'ask'){
    chooseTaxAndAdd(p, opts.variation);
    return;
  }
  pushLine(p, p.price, opts.variation);
}

function chooseTaxAndAdd(p, variation){
  const t = prompt(`${p.name} の税率を選択：8（軽減）/ 10（標準）`, '10');
  if(t===null) return;
  const tax = Number(t);
  if(![0,8,10].includes(tax)){ toast('税率は 0/8/10 で入力してください'); return; }
  pushLine({...p, tax}, p.price, variation);
}

function pushLine(p, price, variation){
  // 既存行（同一商品＋同一バリエーション＋同一価格）に統合
  const sameIdx = CART.items.findIndex(it=>
    it.productId===p.id && it.variation===(variation||'') && it.price===price && !it.refund
  );
  if(sameIdx>=0){
    CART.items[sameIdx].qty += 1;
  }else{
    CART.items.push({
      id: uid(),
      productId: p.id,
      name: p.name,
      variation: variation||'',
      price,
      qty: 1,
      tax: p.tax,
      isDept: !!p.dept,
    });
  }
  renderCart();
}

function renderCart(){
  const ul = $('#cartItems'); ul.innerHTML='';
  $('#cartEmpty').style.display = CART.items.length?'none':'';
  $('#cartTicketSub').textContent = `伝票No: ${CART.ticketNo} / 人数: ${CART.ticket.people}${CART.ticket.customer?' / '+CART.ticket.customer:''}`;
  CART.items.forEach(it=>{
    const li = document.createElement('li');
    li.className = 'cart-item' + (it.refund?' minus':'');
    li.innerHTML = `
      <div>
        <div class="ci-name">${escapeHtml(it.name)}${it.variation?' <span class="ci-meta">('+escapeHtml(it.variation)+')</span>':''}</div>
        <div class="ci-meta">${yen(it.price)} × <span class="ci-qty">${it.qty}</span></div>
      </div>
      <div class="ci-price">${yen(it.price * it.qty)}</div>
    `;
    li.addEventListener('click', ()=>openLineEdit(it.id));
    ul.appendChild(li);
  });
  // 集計
  const t = calcTotals(CART);
  $('#ttlSubtotal').textContent = yen(t.subtotal);
  $('#ttlTax').textContent = yen(t.tax);
  $('#ttlDiscount').textContent = (t.discount>=0?'-':'+') + yen(Math.abs(t.discount));
  $('#ttlGrand').textContent = yen(t.grand);
}

function calcTotals(cart){
  const mode = DB.settings.taxMode; // incl / excl
  let subtotal = 0;  // 税抜小計（外税モード時の表示用にも使用）
  let inclSub = 0;   // 内税モード時の小計表示用（=税込小計）
  let tax = 0;
  cart.items.forEach(it=>{
    const r = (it.tax==='ask'?10:Number(it.tax))/100;
    const line = it.price * it.qty;
    if(mode==='incl'){
      // 内税: 価格は税込
      inclSub += line;
      const ex = line / (1+r);
      tax += line - ex;
    }else{
      // 外税: 価格は税抜
      subtotal += line;
      tax += line * r;
    }
  });
  if(mode==='incl'){
    subtotal = inclSub; // 表示上の「小計」は税込で見せる
  }
  // 端数
  tax = roundTax(tax);
  let preDiscount = (mode==='incl') ? subtotal : (subtotal + tax);
  // 割引・割増
  const d = cart.discount;
  let discount = 0;
  if(d.type==='amount')          discount =  Math.max(0,d.value||0);
  if(d.type==='percent')         discount =  preDiscount * (Math.max(0,d.value||0)/100);
  if(d.type==='markup_amount')   discount = -Math.max(0,d.value||0);
  if(d.type==='markup_percent')  discount = -preDiscount * (Math.max(0,d.value||0)/100);
  discount = roundTax(discount);
  const grand = Math.max(0, preDiscount - discount);
  return {subtotal, tax, discount, grand};
}
function roundTax(n){
  const r = DB.settings.round;
  if(r==='round') return Math.round(n);
  if(r==='ceil')  return Math.ceil(n);
  return Math.floor(n);
}

/* --- 行編集モーダル --- */
let editingLineId = null;
let editingLineMode = 'qty'; // qty | price
function openLineEdit(id){
  editingLineId = id;
  editingLineMode = 'qty';
  const it = CART.items.find(x=>x.id===id); if(!it) return;
  $('#lineEditTitle').textContent = `${it.name} — 数量／金額を変更`;
  $('#lineEditDisplay').textContent = it.qty;
  $('#modalLineEdit').classList.add('show');
}
keypadBind('#lineEditKeypad','#lineEditDisplay');
$('#lineEditOK').addEventListener('click', ()=>{
  const v = Number($('#lineEditDisplay').textContent.replace(/[^\d]/g,''))||0;
  const it = CART.items.find(x=>x.id===editingLineId); if(!it) return;
  if(v===0){
    CART.items = CART.items.filter(x=>x.id!==it.id);
  }else{
    it.qty = v;
  }
  $('#modalLineEdit').classList.remove('show');
  renderCart();
});
$('#lineEditDel').addEventListener('click', ()=>{
  CART.items = CART.items.filter(x=>x.id!==editingLineId);
  $('#modalLineEdit').classList.remove('show');
  renderCart();
});

/* --- バリエーション --- */
let varPickerProduct = null;
function openVariationPicker(p){
  varPickerProduct = p;
  $('#varTitle').textContent = `${p.name} — バリエーション`;
  const g = $('#varGrid'); g.innerHTML='';
  p.variations.forEach(v=>{
    const b = document.createElement('button');
    b.textContent = v;
    b.addEventListener('click', ()=>{
      $('#modalVariation').classList.remove('show');
      addToCart(p, {variation:v});
    });
    g.appendChild(b);
  });
  $('#modalVariation').classList.add('show');
}

/* --- 部門打ち キーパッド --- */
let deptCtx = null;
function openDeptKeypad(p, variation){
  deptCtx = {p, variation:variation||''};
  $('#deptName').textContent = p.name + (variation?` (${variation})`:'');
  $('#deptDisplay').textContent = '0';
  $('#modalDept').classList.add('show');
}
keypadBind('#deptKeypad','#deptDisplay');
$('#deptConfirm').addEventListener('click', ()=>{
  const v = Number($('#deptDisplay').textContent.replace(/[^\d]/g,''))||0;
  if(v<=0){ toast('価格を入力してください'); return; }
  if(deptCtx.p.tax==='ask'){
    $('#modalDept').classList.remove('show');
    chooseTaxAndAddCustom(deptCtx.p, v, deptCtx.variation);
  }else{
    pushLine(deptCtx.p, v, deptCtx.variation);
    $('#modalDept').classList.remove('show');
  }
});
function chooseTaxAndAddCustom(p,price,variation){
  const t = prompt(`${p.name} の税率を選択：8（軽減）/ 10（標準）`, '10');
  if(t===null) return;
  const tax = Number(t);
  if(![0,8,10].includes(tax)){ toast('税率は 0/8/10 で入力してください'); return; }
  pushLine({...p, tax}, price, variation);
}

/* --- 共通キーパッド --- */
function keypadBind(padSel, dispSel, onChange){
  $(padSel).addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const disp = $(dispSel);
    let s = disp.textContent.replace(/[^\d]/g,'');
    if(btn.dataset.act==='back'){
      s = s.slice(0,-1) || '0';
    }else{
      const add = btn.textContent.trim();
      if(s==='0') s = '';
      s = (s + add).slice(0,9);
      if(s==='') s='0';
    }
    disp.textContent = Number(s).toLocaleString('ja-JP');
    if(onChange) onChange(Number(s)||0);
  });
}

/* --- 伝票情報 --- */
$('#btnTicketInfo').addEventListener('click', ()=>{
  $('#tkPeople').value = CART.ticket.people;
  $('#tkTable').value = CART.ticket.table;
  $('#tkCustomer').value = CART.ticket.customer;
  $('#tkMemo').value = CART.ticket.memo;
  $('#modalTicket').classList.add('show');
});
$('#tkOK').addEventListener('click', ()=>{
  CART.ticket = {
    people: Number($('#tkPeople').value)||1,
    table:  $('#tkTable').value,
    customer: $('#tkCustomer').value,
    memo:  $('#tkMemo').value,
  };
  $('#modalTicket').classList.remove('show');
  renderCart();
});

/* --- 一時保存 --- */
$('#btnHold').addEventListener('click', ()=>{
  if(!CART.items.length){ toast('伝票が空です'); return; }
  DB.holds.push({
    ...JSON.parse(JSON.stringify(CART)),
    holdAt: Date.now(),
  });
  save();
  newCart();
  renderOrderScreen();
  toast('伝票を一時保存しました');
});
$('#btnHoldList').addEventListener('click', ()=>{
  const w = $('#holdList'); w.innerHTML='';
  if(!DB.holds.length){
    w.innerHTML = '<p style="color:var(--ink-3)">保存された伝票はありません</p>';
  }
  DB.holds.forEach((h,i)=>{
    const t = calcTotals(h);
    const card = document.createElement('div');
    card.className='hold-card';
    card.innerHTML = `
      <span class="hc-del" data-hold-del="${i}">削除</span>
      <div class="hc-no">${h.ticketNo} / ${fmtDT(h.holdAt)}</div>
      <div class="hc-cust">${escapeHtml(h.ticket.customer||h.ticket.table||'(無題)')}</div>
      <div class="hc-meta">${h.items.length}品 / ${h.ticket.people}名</div>
      <div class="hc-total">${yen(t.grand)}</div>
    `;
    card.addEventListener('click', e=>{
      if(e.target.dataset.holdDel!==undefined) return;
      // 現在カートに何かあれば確認
      if(CART.items.length && !confirm('現在の伝票は破棄され、選択した伝票を呼び出します。よろしいですか？')) return;
      CART = JSON.parse(JSON.stringify(h));
      DB.holds.splice(i,1); save();
      $('#modalHoldList').classList.remove('show');
      renderOrderScreen();
      toast('伝票を呼び戻しました');
    });
    w.appendChild(card);
  });
  // 削除イベント
  w.querySelectorAll('[data-hold-del]').forEach(el=>{
    el.addEventListener('click', e=>{
      e.stopPropagation();
      const i = Number(el.dataset.holdDel);
      DB.holds.splice(i,1); save();
      el.closest('.hold-card').remove();
    });
  });
  $('#modalHoldList').classList.add('show');
});

/* --- クリア --- */
$('#btnClearCart').addEventListener('click', ()=>{
  if(!CART.items.length){ return; }
  if(!confirm('伝票をクリアしますか？')) return;
  newCart();
  renderOrderScreen();
});

/* --- 割引 --- */
$('#btnDiscount').addEventListener('click', ()=>{
  $('#dcType').value = CART.discount.type;
  $('#dcValue').value = CART.discount.value || '';
  $('#modalDiscount').classList.add('show');
});
$('#dcOK').addEventListener('click', ()=>{
  CART.discount = {
    type: $('#dcType').value,
    value: Number($('#dcValue').value)||0,
  };
  $('#modalDiscount').classList.remove('show');
  renderCart();
});

/* ---------- 6. 支払い ---------- */
let PAY = {method:'cash', tendered:0};
$('#btnToPayment').addEventListener('click', ()=>{
  if(!CART.items.length){ toast('商品を選択してください'); return; }
  const t = calcTotals(CART);
  PAY = {method:'cash', tendered:0, grand:t.grand};
  $('#payGrand').textContent = yen(t.grand);
  $('#payTendered').textContent = yen(0);
  $('#payChange').textContent = yen(0);
  $('#payDisplay').textContent = '0';
  // 支払方法
  const pm = $('#payMethods'); pm.innerHTML='';
  DB.settings.paymentMethods.filter(m=>m.enabled).forEach(m=>{
    const b = document.createElement('button');
    b.textContent = m.name;
    b.dataset.method = m.id;
    if(m.id===PAY.method) b.classList.add('on');
    b.addEventListener('click', ()=>{
      PAY.method = m.id;
      pm.querySelectorAll('button').forEach(x=>x.classList.toggle('on', x.dataset.method===m.id));
      $('#payMethodLabel').textContent = m.name;
      // 現金以外はちょうどに自動セット
      if(m.id!=='cash'){
        PAY.tendered = PAY.grand;
        $('#payDisplay').textContent = PAY.grand.toLocaleString('ja-JP');
        recalcPay();
      }
    });
    pm.appendChild(b);
  });
  $('#payMethodLabel').textContent = DB.settings.paymentMethods.find(m=>m.id==='cash')?.name || '現金';
  // クイック金額
  const qt = $('#quickTender'); qt.innerHTML='';
  [t.grand, Math.ceil(t.grand/1000)*1000, Math.ceil(t.grand/5000)*5000, Math.ceil(t.grand/10000)*10000, 5000, 10000]
    .filter((v,i,a)=>v>0 && a.indexOf(v)===i).slice(0,6).forEach(v=>{
      const b = document.createElement('button');
      b.textContent = yen(v);
      b.addEventListener('click', ()=>{
        PAY.tendered = v;
        $('#payDisplay').textContent = v.toLocaleString('ja-JP');
        recalcPay();
      });
      qt.appendChild(b);
    });
  $('#modalPayment').classList.add('show');
});
keypadBind('#payKeypad','#payDisplay', recalcPay);
function recalcPay(v){
  if(v===undefined) v = Number($('#payDisplay').textContent.replace(/[^\d]/g,''))||0;
  PAY.tendered = v;
  $('#payTendered').textContent = yen(v);
  const ch = v - PAY.grand;
  $('#payChange').textContent = yen(ch>=0?ch:0);
}
$('#payConfirm').addEventListener('click', ()=>{
  if(PAY.method==='cash' && PAY.tendered < PAY.grand){
    toast('お預かり金額が不足しています'); return;
  }
  finalizeSale();
});

function finalizeSale(){
  const t = calcTotals(CART);
  const txn = {
    id: uid(),
    type: 'sale',
    ticketNo: CART.ticketNo,
    ts: Date.now(),
    date: todayStr(),
    items: JSON.parse(JSON.stringify(CART.items)),
    ticket: {...CART.ticket},
    discount: {...CART.discount},
    subtotal: t.subtotal, tax: t.tax, discountAmt: t.discount,
    total: t.grand,
    method: PAY.method,
    tendered: PAY.tendered,
    change: Math.max(0, PAY.tendered - t.grand),
  };
  DB.txns.push(txn);
  // 在庫を減らす
  CART.items.forEach(it=>{
    const p = DB.products.find(x=>x.id===it.productId);
    if(p && p.stock!==null && p.stock!==undefined){
      p.stock = Math.max(0, p.stock - it.qty);
    }
  });
  save();
  $('#modalPayment').classList.remove('show');
  if($('#payIssueReceipt').checked){
    showReceipt(txn, {invoice: $('#payIssueInvoice').checked});
  }else{
    newCart(); renderOrderScreen();
    toast('会計が完了しました');
  }
}

/* ---------- 7. レシート ---------- */
function buildReceipt(txn, opts={}){
  const s = DB.settings;
  const lines = [];
  const W = 32;
  const pad = (l,r)=>{
    const left = l, right = String(r);
    const sp = Math.max(1, W - [...left].reduce((a,c)=>a+(c.charCodeAt(0)>127?2:1),0) - right.length);
    return left + ' '.repeat(sp) + right;
  };
  if(s.rcLogo){
    lines.push(`<div class="center big">${escapeHtml(s.shop)}</div>`);
  }else{
    lines.push(`<div class="center">${escapeHtml(s.shop)}</div>`);
  }
  if(s.addr) lines.push(`<div class="center">${escapeHtml(s.addr)}</div>`);
  if(s.tel)  lines.push(`<div class="center">TEL ${escapeHtml(s.tel)}</div>`);
  lines.push(`<hr>`);
  lines.push(`<div>${fmtDT(txn.ts)}</div>`);
  lines.push(`<div>伝票No: ${txn.ticketNo}</div>`);
  if(opts.invoice) lines.push(`<div class="big">領 収 書</div>`);
  if(txn.type==='refund') lines.push(`<div class="big">【 返 品 】</div>`);
  lines.push(`<hr>`);
  txn.items.forEach(it=>{
    const name = it.name + (it.variation?`(${it.variation})`:'');
    lines.push(`<div>${escapeHtml(name)}</div>`);
    lines.push(`<div class="row"><span>　${it.qty} × ${yen(it.price)}</span><span>${yen(it.qty*it.price)}</span></div>`);
  });
  lines.push(`<hr>`);
  lines.push(`<div class="row"><span>小計</span><span>${yen(txn.subtotal)}</span></div>`);
  if(DB.settings.taxMode==='excl'){
    lines.push(`<div class="row"><span>消費税</span><span>${yen(txn.tax)}</span></div>`);
  }else{
    lines.push(`<div class="row"><span>（内消費税</span><span>${yen(txn.tax)}）</span></div>`);
  }
  if(txn.discountAmt){
    lines.push(`<div class="row"><span>${txn.discountAmt>=0?'割引':'割増'}</span><span>${txn.discountAmt>=0?'-':'+'}${yen(Math.abs(txn.discountAmt))}</span></div>`);
  }
  lines.push(`<div class="row total"><span>合計</span><span>${yen(txn.total)}</span></div>`);
  const methodName = DB.settings.paymentMethods.find(m=>m.id===txn.method)?.name || txn.method;
  lines.push(`<div class="row"><span>${methodName}</span><span>${yen(txn.tendered)}</span></div>`);
  if(txn.method==='cash' && txn.change){
    lines.push(`<div class="row"><span>おつり</span><span>${yen(txn.change)}</span></div>`);
  }
  if(s.invoice){
    lines.push(`<hr><div>登録番号: ${escapeHtml(s.invoice)}</div>`);
  }
  lines.push(`<hr>`);
  if(s.rcHeader) lines.push(`<div class="center">${escapeHtml(s.rcHeader)}</div>`);
  if(s.rcFooter) lines.push(`<div class="center">${escapeHtml(s.rcFooter)}</div>`);
  return lines.join('');
}

function showReceipt(txn, opts={}){
  $('#receipt').innerHTML = buildReceipt(txn, opts);
  $('#modalReceipt').classList.add('show');
}
$('#rcDone').addEventListener('click', ()=>{
  $('#modalReceipt').classList.remove('show');
  newCart();
  renderOrderScreen();
});
$('#rcPrint').addEventListener('click', ()=>{
  const win = window.open('', '_blank', 'width=380,height=600');
  win.document.write(`<html><head><title>レシート</title>
<style>body{font-family:monospace;font-size:12px;padding:20px}
.center{text-align:center}.big{font-size:16px;font-weight:700}
.row{display:flex;justify-content:space-between}
.total{font-size:14px;font-weight:700}
hr{border:none;border-top:1px dashed #aaa;margin:6px 0}</style></head>
<body>${$('#receipt').innerHTML}</body></html>`);
  win.document.close(); setTimeout(()=>win.print(), 200);
});

/* ---------- 8. 売上分析 ---------- */
$$('[data-stab]').forEach(el=>{
  if(el.classList.contains('tab')){
    el.addEventListener('click', ()=>{
      $$('[data-stab].tab').forEach(b=>b.classList.toggle('on', b===el));
      $$('.stab').forEach(p=>p.style.display = p.dataset.stab===el.dataset.stab?'':'none');
    });
  }
});

function renderSales(){
  // 日付の初期値
  const today = todayStr();
  if(!$('#dailyFrom').value){
    $('#dailyFrom').value = today;
    $('#dailyTo').value = today;
    $('#itemFrom').value = todayStr(new Date(Date.now()-30*86400000));
    $('#itemTo').value = today;
  }
  // カテゴリーフィルタ
  const sel = $('#itemCat');
  const prev = sel.value;
  sel.innerHTML = '<option value="">すべて</option>' + DB.cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  sel.value = prev;
  applyDaily();
  applyItem();
}
function inRange(ts, fromStr, toStr){
  const d = todayStr(new Date(ts));
  return (!fromStr || d>=fromStr) && (!toStr || d<=toStr);
}
function applyDaily(){
  const mode = $('#dailyMode').value;
  const from = $('#dailyFrom').value, to = $('#dailyTo').value;
  const sales = DB.txns.filter(t=>t.type!=='void' && inRange(t.ts, from, to));

  const buckets = new Map();
  sales.forEach(t=>{
    const d = new Date(t.ts);
    let key;
    if(mode==='hour') key = String(d.getHours()).padStart(2,'0')+'時';
    else if(mode==='day') key = todayStr(d);
    else if(mode==='month') key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    else key = `${d.getFullYear()}年`;
    const cur = buckets.get(key) || {key, count:0, items:0, total:0};
    cur.count += 1;
    cur.items += t.items.reduce((a,b)=>a+(t.type==='refund'?-b.qty:b.qty),0);
    cur.total += t.total;
    buckets.set(key, cur);
  });
  const rows = [...buckets.values()].sort((a,b)=>a.key.localeCompare(b.key));
  // KPI
  const total = rows.reduce((a,b)=>a+b.total,0);
  const count = sales.filter(t=>t.type==='sale').length;
  const items = rows.reduce((a,b)=>a+b.items,0);
  $('#kpiTotal').textContent = yen(total);
  $('#kpiCount').textContent = count;
  $('#kpiAvg').textContent = yen(count?total/count:0);
  $('#kpiItems').textContent = items;
  // チャート
  const chart = $('#dailyChart'); chart.innerHTML='';
  const max = Math.max(1, ...rows.map(r=>r.total));
  rows.forEach(r=>{
    const bar = document.createElement('div');
    bar.className='bar';
    bar.style.height = `${(r.total/max)*160}px`;
    bar.innerHTML = `<span class="bar-val">${yen(r.total)}</span><span class="bar-key">${r.key}</span>`;
    chart.appendChild(bar);
  });
  if(!rows.length){ chart.innerHTML = '<div style="color:var(--ink-3);margin:auto">データがありません</div>'; }
  // テーブル
  const colLabel = {hour:'時間帯',day:'日付',month:'月',year:'年'}[mode];
  $('#dailyColKey').textContent = colLabel;
  const tb = $('#dailyTbody'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.key}</td><td class="num">${r.count}</td><td class="num">${r.items}</td><td class="num">${yen(r.total)}</td>`;
    tb.appendChild(tr);
  });
}
$('#btnDailyApply').addEventListener('click', applyDaily);
$('#dailyMode').addEventListener('change', applyDaily);

function applyItem(){
  const from = $('#itemFrom').value, to = $('#itemTo').value;
  const catId = $('#itemCat').value;
  const sales = DB.txns.filter(t=>t.type!=='void' && inRange(t.ts, from, to));
  const map = new Map();
  sales.forEach(t=>{
    t.items.forEach(it=>{
      const p = DB.products.find(x=>x.id===it.productId);
      if(catId && p?.catId !== catId) return;
      const k = it.productId + '@' + (it.variation||'');
      const cur = map.get(k) || {name:it.name+(it.variation?`(${it.variation})`:''), catName:DB.cats.find(c=>c.id===p?.catId)?.name||'未分類', qty:0, total:0};
      const sign = t.type==='refund'?-1:1;
      cur.qty += it.qty * sign;
      cur.total += it.qty * it.price * sign;
      map.set(k, cur);
    });
  });
  const rows = [...map.values()].sort((a,b)=>b.total-a.total);
  const sum = rows.reduce((a,b)=>a+b.total,0) || 1;
  const tb = $('#itemTbody'); tb.innerHTML='';
  rows.forEach((r,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.catName)}</td>
      <td class="num">${r.qty}</td>
      <td class="num">${yen(r.total)}</td>
      <td class="num">${(r.total/sum*100).toFixed(1)}%</td>`;
    tb.appendChild(tr);
  });
  if(!rows.length){
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ink-3)">データがありません</td></tr>';
  }
}
$('#btnItemApply').addEventListener('click', applyItem);

/* CSV出力 */
function downloadCSV(name, rows){
  const csv = rows.map(r=>r.map(c=>{
    const s = String(c??'');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name; a.click();
}
$('#btnExportCSV').addEventListener('click', ()=>{
  const rows = [['カテゴリー','商品名','価格','税率','在庫','バリエーション','バーコード']];
  DB.products.forEach(p=>{
    const cat = DB.cats.find(c=>c.id===p.catId)?.name||'';
    rows.push([cat, p.name, p.dept?'部門打ち':p.price, taxLabel(p.tax), p.stock??'', (p.variations||[]).join('|'), p.barcode||'']);
  });
  downloadCSV(`products_${todayStr()}.csv`, rows);
});
$('#btnDailyCSV').addEventListener('click', ()=>{
  const rows = [[$('#dailyColKey').textContent,'取引数','点数','売上']];
  $$('#dailyTbody tr').forEach(tr=>{
    rows.push([...tr.querySelectorAll('td')].map(td=>td.textContent.replace(/[¥,]/g,'')));
  });
  downloadCSV(`daily_${todayStr()}.csv`, rows);
});
$('#btnItemCSV').addEventListener('click', ()=>{
  const rows = [['順位','商品名','カテゴリー','販売数','売上','構成比']];
  $$('#itemTbody tr').forEach(tr=>{
    rows.push([...tr.querySelectorAll('td')].map(td=>td.textContent.replace(/[¥,]/g,'')));
  });
  downloadCSV(`items_${todayStr()}.csv`, rows);
});

/* サンプル投入 */
$('#btnImportSamples').addEventListener('click', ()=>{
  if(DB.products.length && !confirm('既存の商品・カテゴリーは保持し、サンプルを追加します。よろしいですか？')) return;
  const samples = [
    {cat:'ドリンク', color:'#A0E7E5', items:[
      {name:'コーヒー', price:400, tax:10},
      {name:'カフェラテ', price:480, tax:10},
      {name:'紅茶', price:420, tax:10},
      {name:'オレンジジュース', price:380, tax:10},
    ]},
    {cat:'フード', color:'#FBE7C6', items:[
      {name:'サンドイッチ', price:580, tax:8},
      {name:'パスタ', price:980, tax:8},
      {name:'サラダ', price:680, tax:8},
      {name:'本日のスープ', price:450, tax:8, variations:['カップ','ボウル']},
    ]},
    {cat:'デザート', color:'#FFAEBC', items:[
      {name:'チーズケーキ', price:480, tax:8},
      {name:'プリン', price:380, tax:8},
      {name:'アイス', price:320, tax:8, variations:['バニラ','チョコ','抹茶']},
    ]},
    {cat:'物販', color:'#B4F8C8', items:[
      {name:'量り売り（部門）', price:0, tax:10, dept:true},
      {name:'コーヒー豆 200g', price:1200, tax:10, stock:20},
      {name:'マグカップ', price:1800, tax:10, stock:8},
    ]},
  ];
  samples.forEach(s=>{
    let cat = DB.cats.find(c=>c.name===s.cat);
    if(!cat){
      cat = {id:uid(), name:s.cat, color:s.color, staff:''};
      DB.cats.push(cat);
    }
    s.items.forEach(it=>{
      DB.products.push({
        id:uid(), name:it.name, price:it.price, tax:it.tax,
        catId:cat.id, color:s.color, stock:it.stock??null,
        variations:it.variations||[], dept:!!it.dept, barcode:'',
      });
    });
  });
  save(); renderProducts();
  toast('サンプルデータを追加しました');
});

/* ---------- 9. 点検・精算 ---------- */
function renderRegister(){
  $('#floatAmount').textContent = yen(DB.floatMoney||0);
  // 本日の点検
  const today = todayStr();
  const todays = DB.txns.filter(t=>t.date===today);
  const sales = todays.filter(t=>t.type==='sale');
  const refunds = todays.filter(t=>t.type==='refund');
  const totalSales = sales.reduce((a,b)=>a+b.total,0);
  const totalRefund = refunds.reduce((a,b)=>a+b.total,0);
  const byMethod = {};
  todays.forEach(t=>{
    byMethod[t.method] = (byMethod[t.method]||0) + t.total;
  });
  const cashIn = byMethod['cash']||0;
  const expected = (DB.floatMoney||0) + cashIn;
  const rows = [
    ['総売上', yen(totalSales)],
    ['返品計', yen(totalRefund)],
    ['正味売上', yen(totalSales+totalRefund)],
    ['取引数', `${sales.length}件 (返品 ${refunds.length}件)`],
  ];
  DB.settings.paymentMethods.filter(m=>m.enabled).forEach(m=>{
    rows.push([`${m.name} 売上`, yen(byMethod[m.id]||0)]);
  });
  rows.push(['つり銭準備金', yen(DB.floatMoney||0)]);
  rows.push(['理論ドロア在高', yen(expected)]);
  $('#checkTable').innerHTML = rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');

  // 精算履歴
  const tb = $('#settleTbody'); tb.innerHTML='';
  [...DB.settlements].reverse().forEach(s=>{
    const tr = document.createElement('tr');
    const diff = s.diff;
    const diffStr = diff===0?'±0':(diff>0?'+':'')+yen(diff);
    tr.innerHTML = `
      <td>${fmtDT(s.ts)}</td>
      <td>${escapeHtml(s.staff||'-')}</td>
      <td class="num">${yen(s.totalSales)}</td>
      <td class="num">${s.count}</td>
      <td class="num" style="color:${diff===0?'inherit':diff>0?'var(--ok)':'var(--danger)'}">${diffStr}</td>
      <td class="row-act"><button class="mini-btn" data-print-settle="${s.id}">レシート</button></td>`;
    tb.appendChild(tr);
  });
}
$('#btnSetFloat').addEventListener('click', ()=>{
  const v = Number($('#floatInput').value)||0;
  DB.floatMoney = v;
  save();
  renderRegister();
  toast('つり銭準備金を登録しました');
});
$('#btnPrintCheck').addEventListener('click', ()=>{
  const html = $('#checkTable').outerHTML;
  const win = window.open('', '_blank', 'width=380,height=600');
  win.document.write(`<html><head><title>点検レシート</title>
<style>body{font-family:monospace;font-size:12px;padding:20px}
table{width:100%;border-collapse:collapse}
td{padding:4px 0;border-bottom:1px dashed #aaa}
td:last-child{text-align:right;font-weight:700}</style></head>
<body><h3 style="text-align:center">${escapeHtml(DB.settings.shop)} 点検レシート</h3>
<p style="text-align:center">${fmtDT(Date.now())}</p>${html}</body></html>`);
  win.document.close(); setTimeout(()=>win.print(), 200);
});
$('#btnSettle').addEventListener('click', ()=>{
  const drawer = Number($('#drawerInput').value);
  const carry = Number($('#carryInput').value) || (DB.floatMoney||0);
  if(isNaN(drawer)){ toast('ドロア内現金を入力してください'); return; }
  const today = todayStr();
  const todays = DB.txns.filter(t=>t.date===today);
  const cashIn = todays.filter(t=>t.method==='cash').reduce((a,b)=>a+b.total,0);
  const expected = (DB.floatMoney||0) + cashIn;
  const diff = drawer - expected;
  const id = uid();
  DB.settlements.push({
    id, ts:Date.now(), staff:'店長',
    totalSales: todays.filter(t=>t.type==='sale').reduce((a,b)=>a+b.total,0),
    count: todays.filter(t=>t.type==='sale').length,
    expectedCash: expected, actualCash: drawer, diff,
    carry,
  });
  DB.floatMoney = carry;
  save();
  $('#settleResult').classList.add('show');
  $('#settleResult').innerHTML = `
    <div><b>精算完了</b></div>
    <div>理論在高: ${yen(expected)} / 実在高: ${yen(drawer)} / 過不足: <b style="color:${diff===0?'var(--em-700)':diff>0?'var(--ok)':'var(--danger)'}">${diff===0?'±0':(diff>0?'+':'')+yen(diff)}</b></div>
    <div>翌営業日へ繰越（つり銭準備金）: ${yen(carry)}</div>`;
  renderRegister();
});

/* ---------- 10. 取引履歴 ---------- */
function renderHistory(){
  if(!$('#histFrom').value){
    $('#histFrom').value = todayStr(new Date(Date.now()-7*86400000));
    $('#histTo').value = todayStr();
  }
  applyHistory();
}
function applyHistory(){
  const type = $('#histType').value;
  const from = $('#histFrom').value, to = $('#histTo').value;
  const tb = $('#histTbody'); tb.innerHTML='';
  const rows = DB.txns
    .filter(t=>!type || t.type===type)
    .filter(t=>inRange(t.ts, from, to))
    .sort((a,b)=>b.ts-a.ts);
  rows.forEach(t=>{
    const tr = document.createElement('tr');
    const typeLabel = {sale:'会計', refund:'返品', void:'取消'}[t.type] || t.type;
    const methodName = DB.settings.paymentMethods.find(m=>m.id===t.method)?.name || t.method;
    tr.innerHTML = `
      <td>${fmtDT(t.ts)}</td>
      <td>${t.ticketNo}</td>
      <td>${typeLabel}</td>
      <td class="num">${t.items.reduce((a,b)=>a+b.qty,0)}</td>
      <td>${methodName}</td>
      <td class="num">${yen(t.total)}</td>
      <td class="row-act"><button class="mini-btn" data-show-txn="${t.id}">詳細</button></td>
    `;
    tb.appendChild(tr);
  });
  if(!rows.length){
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ink-3)">該当する取引がありません</td></tr>';
  }
}
$('#btnHistApply').addEventListener('click', applyHistory);

let currentTxnId = null;
document.addEventListener('click', e=>{
  const b = e.target.closest('[data-show-txn]');
  if(b) openTxnDetail(b.dataset.showTxn);
});
function openTxnDetail(id){
  const t = DB.txns.find(x=>x.id===id); if(!t) return;
  currentTxnId = id;
  const list = t.items.map(it=>`
    <div class="row" style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--line-2)">
      <span>${escapeHtml(it.name)}${it.variation?` (${it.variation})`:''} × ${it.qty}</span>
      <span>${yen(it.qty*it.price)}</span>
    </div>`).join('');
  const methodName = DB.settings.paymentMethods.find(m=>m.id===t.method)?.name || t.method;
  $('#txnDetail').innerHTML = `
    <div style="margin-bottom:8px">
      <div><b>${t.ticketNo}</b> / ${fmtDT(t.ts)}</div>
      <div>種別: ${({sale:'会計', refund:'返品', void:'取消'}[t.type])} / 支払: ${methodName}</div>
    </div>
    ${list}
    <div style="margin-top:8px;font-size:15px;font-weight:700;text-align:right">合計 ${yen(t.total)}</div>`;
  $('#txnVoid').style.display = t.type==='sale'?'':'none';
  $('#modalTxn').classList.add('show');
}
$('#txnReprint').addEventListener('click', ()=>{
  const t = DB.txns.find(x=>x.id===currentTxnId); if(!t) return;
  $('#modalTxn').classList.remove('show');
  showReceipt(t, {});
});
$('#txnVoid').addEventListener('click', ()=>{
  const t = DB.txns.find(x=>x.id===currentTxnId); if(!t) return;
  if(!confirm('この取引を取り消し、マイナス伝票を作成します。よろしいですか？')) return;
  const refund = {
    ...JSON.parse(JSON.stringify(t)),
    id: uid(),
    type: 'refund',
    ts: Date.now(),
    date: todayStr(),
    ticketNo: t.ticketNo + '-R',
    subtotal: -t.subtotal, tax: -t.tax, discountAmt: -t.discountAmt, total: -t.total,
    tendered: -t.tendered, change: 0,
    items: t.items.map(it=>({...it, qty: it.qty})),  // 表示用、合計は反転済み
    refundOf: t.id,
  };
  DB.txns.push(refund);
  // 在庫戻し
  t.items.forEach(it=>{
    const p = DB.products.find(x=>x.id===it.productId);
    if(p && p.stock!==null && p.stock!==undefined) p.stock += it.qty;
  });
  save();
  $('#modalTxn').classList.remove('show');
  renderHistory();
  toast('返品（マイナス伝票）を作成しました');
});

/* ---------- 11. 設定 ---------- */
function renderSettings(){
  const s = DB.settings;
  $('#setShop').value = s.shop;
  $('#setAddr').value = s.addr;
  $('#setTel').value = s.tel;
  $('#setInvoice').value = s.invoice;
  $('#setTaxMode').value = s.taxMode;
  $('#setDefaultRate').value = s.defaultRate;
  $('#setRound').value = s.round;
  $('#setRcHeader').value = s.rcHeader;
  $('#setRcFooter').value = s.rcFooter;
  $('#setRcLogo').checked = s.rcLogo;
  // 支払方法
  const pl = $('#paymentMethodList'); pl.innerHTML='';
  s.paymentMethods.forEach((m,i)=>{
    const row = document.createElement('div');
    row.className='pm-row';
    row.innerHTML = `
      <input type="checkbox" ${m.enabled?'checked':''} data-pm="${i}">
      <input type="text" value="${escapeHtml(m.name)}" data-pmname="${i}">
    `;
    pl.appendChild(row);
  });
}
$('#btnSaveSettings').addEventListener('click', ()=>{
  const s = DB.settings;
  s.shop = $('#setShop').value;
  s.addr = $('#setAddr').value;
  s.tel = $('#setTel').value;
  s.invoice = $('#setInvoice').value;
  s.taxMode = $('#setTaxMode').value;
  s.defaultRate = Number($('#setDefaultRate').value);
  s.round = $('#setRound').value;
  s.rcHeader = $('#setRcHeader').value;
  s.rcFooter = $('#setRcFooter').value;
  s.rcLogo = $('#setRcLogo').checked;
  $$('#paymentMethodList [data-pm]').forEach(el=>{
    const i = Number(el.dataset.pm); s.paymentMethods[i].enabled = el.checked;
  });
  $$('#paymentMethodList [data-pmname]').forEach(el=>{
    const i = Number(el.dataset.pmname); s.paymentMethods[i].name = el.value;
  });
  save();
  $('#shopName').textContent = s.shop;
  toast('設定を保存しました');
});

$('#btnExportAll').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(DB,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `koregi-backup-${todayStr()}.json`;
  a.click();
});
$('#btnImportAll').addEventListener('click', ()=>$('#importFile').click());
$('#importFile').addEventListener('change', e=>{
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const d = JSON.parse(r.result);
      if(!confirm('既存データを上書きします。よろしいですか？')) return;
      DB = {...defaultData(), ...d};
      save(); location.reload();
    }catch(err){ toast('JSONの読み込みに失敗しました'); }
  };
  r.readAsText(f);
});
$('#btnResetAll').addEventListener('click', ()=>{
  if(!confirm('全データを初期化します。本当によろしいですか？')) return;
  if(!confirm('元に戻せません。最終確認：初期化を実行します。')) return;
  localStorage.removeItem(KEY);
  location.reload();
});

/* ---------- 12. 時計・初期化 ---------- */
function tick(){
  const d = new Date();
  $('#clock').textContent = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
setInterval(tick, 30000); tick();

// 検索ボックスは入力で即時反映
$('#productSearch').addEventListener('input', renderProducts);
$('#productFilterCat').addEventListener('change', renderProducts);

// 初回起動：データが空ならサンプルを入れて誘導
if(DB.products.length===0 && DB.cats.length===0){
  // 自動投入はしないが、ホームを案内
  // （ユーザーは「サンプルデータ投入」ボタンから追加可能）
}

$('#shopName').textContent = DB.settings.shop || 'お店';
nav('home');
