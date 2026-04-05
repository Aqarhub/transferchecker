// ==UserScript==
// @name         FAAST Transfer Checker v5
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Transfer pick task order checker - auto-updates from GitHub
// @author       Abdullah Al Otaibi (abdualot) — https://atoz.amazon.work/phonetool/users/abdualot
// @match        *://faast.amazon.co.uk/web/picktasks/*
// @include      *faast.amazon.co.uk/web/picktasks/*
// @run-at       document-idle
// @grant        none
// @license      Proprietary — All rights reserved
// @updateURL    https://raw.githubusercontent.com/Aqarhub/transferchecker/main/transfer_checker.user.js
// @downloadURL  https://raw.githubusercontent.com/Aqarhub/transferchecker/main/transfer_checker.user.js
// ==/UserScript==

// ============================================================================
//  FAAST Transfer Checker v5
//  Author:  Abdullah Al Otaibi (abdualot)
//  Phone:   https://atoz.amazon.work/phonetool/users/abdualot
//  License: Proprietary — All rights reserved
//
//  AUTO-UPDATE:
//    This script updates automatically via Tampermonkey.
//    When the author pushes a new version to GitHub, Tampermonkey
//    will detect the version change and prompt to update.
//
//  WHAT IT DOES:
//    Checks all orders in a TRANSFER pick task and shows:
//    - Whether each item has been picked or not
//    - Whether the order is cancelled
//    - Whether the order has been assigned to a tote (Tracking ID)
//
//  HOW TO INSTALL:
//    1. Install Tampermonkey extension in Chrome or Firefox
//    2. Click Tampermonkey icon > Create a new script
//    3. Delete everything in the editor
//    4. Paste this entire file
//    5. Press Ctrl+S to save
//
//  HOW TO USE:
//    1. Open any TRANSFER pick task page on FAAST
//    2. The panel appears at the bottom-right corner
//    3. Click "Start Check" to begin
//    4. Use filter buttons to view specific order types
//    5. Click the CSV button to export results
//
//  COLUMNS:
//    STATUS  - ACCEPTED / PACKED / SHIPPED / CANCELLED
//    PICK    - Y with count if picked, X if not
//    CANCEL  - YES if cancelled, count if partial, dash if none
//    TOTE    - Y if assigned, X if not
//
//  SUPPORT:
//    Contact Abdullah Al Otaibi via PhoneTool (link above)
//
//  (c) Abdullah Al Otaibi — Unauthorized distribution prohibited.
// ============================================================================

(function () {
    'use strict';

    function tryInit() {
        const bodyText = document.body.innerText;
        if (!bodyText.includes('TRANSFER')) return;

        const taskMatch = window.location.href.match(/picktasks\/(\d+)/);
        const taskId = taskMatch ? taskMatch[1] : '';

        let assignedTo = '--';
        const atM = bodyText.match(/Assigned To\s+([\w\s]+?)(?:\n|Tool|Status|Created|Earliest)/);
        if (atM) assignedTo = atM[1].trim();

        let totalQty = '--';
        const tqM = bodyText.match(/Total Quantity\s+(\d+)/);
        if (tqM) totalQty = tqM[1];

        build(taskId, assignedTo, totalQty);
    }

    function build(taskId, assignedTo, totalQty) {
        if (document.getElementById('tc5')) return;

        const p = document.createElement('div');
        p.id = 'tc5';
        p.innerHTML = `
        <style>
            #tc5{position:fixed;bottom:12px;right:12px;width:380px;background:#0c1222;color:#ffffff;z-index:999999;border-radius:12px;border:1px solid rgba(88,166,255,.1);font-family:Consolas,'Courier New',monospace;font-size:11px;box-shadow:0 16px 48px rgba(0,0,0,.55);overflow:hidden;display:flex;flex-direction:column;max-height:70vh;}
            #tc5.mini{width:180px;height:36px;overflow:hidden;border-radius:10px;}
            #tc5.mini .tc5-b{display:none;}
            .tc5-h{padding:8px 12px;cursor:move;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg,rgba(20,30,50,.9),rgba(12,18,34,.95));border-bottom:1px solid rgba(88,166,255,.06);}
            .tc5-h .tl{font-size:11px;font-weight:700;color:#ffffff;display:flex;align-items:center;gap:6px;}
            .tc5-h .tl .dot{width:7px;height:7px;border-radius:50%;background:#238636;box-shadow:0 0 6px #238636;}
            .tc5-h .cr{display:flex;gap:4px;}
            .tc5-h .cr button{background:none;border:1px solid rgba(255,255,255,.1);color:#ffffff;width:22px;height:22px;border-radius:5px;cursor:pointer;font-size:10px;transition:all .15s;}
            .tc5-h .cr button:hover{color:#58a6ff;border-color:rgba(88,166,255,.3);}
            .tc5-info{padding:6px 12px;display:flex;gap:12px;font-size:10px;color:#ffffff;border-bottom:1px solid rgba(255,255,255,.03);background:rgba(22,27,34,.4);}
            .tc5-info b{color:#ffffff;}
            .tc5-info .ac{color:#58a6ff;}
            .tc5-sa{padding:10px 12px;text-align:center;border-bottom:1px solid rgba(255,255,255,.03);}
            .tc5-go{padding:7px 28px;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;background:#238636;color:#fff;transition:all .2s;box-shadow:0 2px 8px rgba(35,134,54,.25);}
            .tc5-go:hover{background:#2ea043;}
            .tc5-no{padding:7px 28px;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;background:#da3633;color:#fff;display:none;}
            .tc5-st{padding:6px 12px;font-size:10px;text-align:center;color:#ffffff;border-bottom:1px solid rgba(255,255,255,.03);}
            .tc5-pb{height:2px;background:rgba(255,255,255,.02);}.tc5-pf{height:100%;width:0%;transition:width .4s;background:linear-gradient(90deg,#1a6bff,#7c3aed);border-radius:2px;}
            .tc5-sm{display:none;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);}
            .tc5-sg{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;}
            .tc5-sc{text-align:center;padding:6px 2px;background:rgba(255,255,255,.015);border-radius:6px;border:1px solid rgba(255,255,255,.03);}
            .tc5-sc .v{font-size:16px;font-weight:700;line-height:1;}.tc5-sc .l{font-size:7px;color:#ffffff;letter-spacing:.8px;margin-top:2px;}
            .tc5-fl{padding:5px 12px;display:none;gap:4px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.03);}
            .tc5-fb{padding:3px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:none;color:#ffffff;cursor:pointer;font-size:9px;font-weight:600;font-family:inherit;transition:all .15s;}
            .tc5-fb:hover{color:#ffffff;border-color:rgba(88,166,255,.3);}
            .tc5-fb.on{background:rgba(88,166,255,.08);border-color:rgba(88,166,255,.3);color:#58a6ff;}
            .tc5-th{display:flex;padding:4px 12px;font-size:8px;color:#ffffff;letter-spacing:1px;font-weight:700;background:rgba(13,17,23,.5);border-bottom:1px solid rgba(255,255,255,.03);position:sticky;top:0;z-index:2;}
            .tc5-th .c{flex:1;text-align:center;}
            .tc5-rs{max-height:220px;overflow-y:auto;}
            .tc5-r{display:flex;align-items:center;padding:5px 12px;border-bottom:1px solid rgba(255,255,255,.015);transition:background .1s;font-size:11px;}
            .tc5-r:hover{background:rgba(255,255,255,.015);}
            .tc5-r .oi{width:90px;font-weight:600;color:#ffffff;cursor:pointer;text-decoration:none;font-size:10px;}
            .tc5-r .oi:hover{text-decoration:underline;color:#58a6ff;}
            .tc5-r .c{flex:1;text-align:center;}
            .t{display:inline-flex;align-items:center;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;}
            .t-pk{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.2);}
            .t-np{background:rgba(210,153,34,.12);color:#d29922;border:1px solid rgba(210,153,34,.15);}
            .t-cn{background:rgba(248,81,73,.12);color:#f85149;border:1px solid rgba(248,81,73,.15);}
            .t-st{background:rgba(88,166,255,.1);color:#58a6ff;border:1px solid rgba(88,166,255,.15);}
            .t-ty{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.2);}
            .t-tn{background:rgba(248,81,73,.12);color:#f85149;border:1px solid rgba(248,81,73,.15);}
            .t-w{background:rgba(255,255,255,.05);color:#aaa;border:1px solid rgba(255,255,255,.08);}
            .t-z{color:#666;}
            .tc5-r.rc{background:rgba(248,81,73,.04);}.tc5-r.rnp{background:rgba(210,153,34,.03);}
            .tc5-ft{padding:5px 12px;font-size:9px;color:#ffffff;display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,.03);background:rgba(8,11,20,.5);}
            .tc5-cr{padding:4px 12px;font-size:8px;color:#484f58;text-align:center;border-top:1px solid rgba(255,255,255,.02);background:rgba(8,11,20,.7);}
            .tc5-cr a{color:#58a6ff;text-decoration:none;}.tc5-cr a:hover{text-decoration:underline;}
            #tc5 ::-webkit-scrollbar{width:3px;}#tc5 ::-webkit-scrollbar-track{background:transparent;}#tc5 ::-webkit-scrollbar-thumb{background:rgba(88,166,255,.12);border-radius:3px;}
        </style>
        <div class="tc5-h">
            <div class="tl"><div class="dot"></div>Transfer Checker — #${taskId}</div>
            <div class="cr"><button id="t5min" title="Minimize">-</button><button id="t5csv" title="Export CSV">CSV</button></div>
        </div>
        <div class="tc5-b">
            <div class="tc5-info">
                <span>Assigned: <b class="ac">${assignedTo}</b></span>
                <span>Qty: <b>${totalQty}</b></span>
            </div>
            <div class="tc5-sa" id="t5sa">
                <button class="tc5-go" id="t5go">Start Check</button>
                <button class="tc5-no" id="t5no">Stop</button>
            </div>
            <div class="tc5-st" id="t5st">Press "Start Check" to begin</div>
            <div class="tc5-pb"><div class="tc5-pf" id="t5bar"></div></div>
            <div class="tc5-sm" id="t5sm">
                <div class="tc5-sg">
                    <div class="tc5-sc"><div class="v" style="color:#ffffff" id="v-tot">0</div><div class="l">TOTAL</div></div>
                    <div class="tc5-sc"><div class="v" style="color:#3fb950" id="v-pk">0</div><div class="l">PICKED</div></div>
                    <div class="tc5-sc"><div class="v" style="color:#d29922" id="v-np">0</div><div class="l">NOT PICKED</div></div>
                    <div class="tc5-sc"><div class="v" style="color:#f85149" id="v-cn">0</div><div class="l">CANCELLED</div></div>
                    <div class="tc5-sc"><div class="v" style="color:#a78bfa" id="v-tt">0</div><div class="l">TOTE</div></div>
                </div>
            </div>
            <div class="tc5-fl" id="t5fl">
                <button class="tc5-fb on" data-f="all">All</button>
                <button class="tc5-fb" data-f="pk">Picked</button>
                <button class="tc5-fb" data-f="np">Not Picked</button>
                <button class="tc5-fb" data-f="cn">Cancelled</button>
                <button class="tc5-fb" data-f="nt">No Tote</button>
            </div>
            <div class="tc5-th"><div style="width:90px">ORDER</div><div class="c">STATUS</div><div class="c">PICK</div><div class="c">CANCEL</div><div class="c">TOTE</div></div>
            <div class="tc5-rs" id="t5rs"></div>
            <div class="tc5-ft"><span id="t5inf">Ready</span><span id="t5tm"></span></div>
            <div class="tc5-cr">Built by <a href="https://atoz.amazon.work/phonetool/users/abdualot" target="_blank">Abdullah Al Otaibi (abdualot)</a></div>
        </div>`;
        document.body.appendChild(p);

        let dg=false,ox,oy;
        p.querySelector('.tc5-h').onmousedown=(e)=>{if(e.target.tagName==='BUTTON')return;dg=true;ox=e.clientX-p.offsetLeft;oy=e.clientY-p.offsetTop;};
        document.addEventListener('mousemove',(e)=>{if(dg){p.style.left=(e.clientX-ox)+'px';p.style.top=(e.clientY-oy)+'px';p.style.right='auto';p.style.bottom='auto';}});
        document.addEventListener('mouseup',()=>dg=false);
        document.getElementById('t5min').onclick=()=>p.classList.toggle('mini');

        const $=id=>document.getElementById(id);
        let running=false,allResults=[];

        async function fetchTask(){
            const r=await fetch(`https://faast.amazon.co.uk/web/picktasks/${taskId}`,{credentials:'same-origin'});
            if(!r.ok) throw new Error('HTTP '+r.status);
            const html=await r.text();
            const doc=new DOMParser().parseFromString(html,'text/html');
            const obs={accepted:[],packed:[],shipped:[],cancelled:[]};
            let cur='';
            doc.querySelectorAll('h3,h4,a').forEach(el=>{
                const t=el.textContent.trim();
                if(t.includes('Accepted Orders')) cur='accepted';
                else if(t.includes('Packed Orders')) cur='packed';
                else if(t.includes('Shipped Orders')) cur='shipped';
                else if(t.includes('Cancelled Orders')) cur='cancelled';
                else if(el.tagName==='A'&&el.href?.includes('/web/orders/')&&t.match(/^D[a-zA-Z0-9]{5,}/)){if(cur) obs[cur].push(t);}
            });
            const skus={};
            doc.querySelectorAll('table').forEach(t=>{
                const ths=Array.from(t.querySelectorAll('th')).map(h=>h.textContent.trim());
                if(!ths.some(h=>h.includes('Quantity Picked'))) return;
                t.querySelectorAll('tbody tr, tr').forEach((r,i)=>{
                    if(i===0&&r.querySelector('th')) return;
                    const c=Array.from(r.querySelectorAll('td'));
                    if(c.length>=7){const sku=c[1].textContent.trim();skus[sku]={ordered:parseInt(c[4].textContent)||0,picked:parseInt(c[5].textContent)||0,canceled:parseInt(c[6].textContent)||0};}
                });
            });
            return {obs,skus};
        }

        async function fetchOrder(oid){
            try{
                const r=await fetch(`https://faast.amazon.co.uk/web/orders/${oid}`,{credentials:'same-origin'});
                if(!r.ok) return {tid:'ERR',st:'ERR',sku:''};
                const html=await r.text();const doc=new DOMParser().parseFromString(html,'text/html');const body=doc.body.innerText;
                let st='Unknown';const sm=body.match(/Status\s+(Accepted|Packed|Shipped|Cancelled|Open|Rejected)/i);if(sm) st=sm[1];
                let tid='N/A';const tm=body.match(/Tracking Id[:\s]+([\w\-\/]+|N\/A)/i);if(tm) tid=tm[1];
                let sku='';
                doc.querySelectorAll('table').forEach(t=>{const ths=Array.from(t.querySelectorAll('th')).map(h=>h.textContent.trim());const si=ths.indexOf('SKU');if(si<0) return;const row=t.querySelector('tbody tr')||t.querySelectorAll('tr')[1];if(row){const cells=row.querySelectorAll('td');if(cells[si]) sku=cells[si].textContent.trim();}});
                return {tid,st,sku};
            }catch(e){return {tid:'ERR',st:'ERR',sku:''};}
        }

        async function start(){
            running=true;$('t5go').style.display='none';$('t5no').style.display='inline-block';
            $('t5sm').style.display='block';$('t5fl').style.display='flex';$('t5rs').innerHTML='';allResults=[];updSum();
            $('t5st').innerHTML='Loading pick task...';
            let td;try{td=await fetchTask();}catch(e){$('t5st').innerHTML='Error: '+e.message;done();return;}
            const {obs,skus}=td;const all=[];
            ['accepted','packed','shipped','cancelled'].forEach(s=>{obs[s].forEach(id=>all.push({id,sec:s}));});
            if(!all.length){$('t5st').innerHTML='No orders found';done();return;}
            all.forEach(o=>{$('t5rs').innerHTML+=mkRow(o.id,null);});
            for(let i=0;i<all.length;i++){
                if(!running) break;const o=all[i];
                $('t5st').innerHTML=`Checking ${o.id} — ${i+1}/${all.length}`;
                $('t5bar').style.width=(((i+1)/all.length)*100)+'%';
                const info=await fetchOrder(o.id);
                let pk={ordered:0,picked:0,canceled:0};if(info.sku&&skus[info.sku]) pk=skus[info.sku];
                const isCn=o.sec==='cancelled',isPk=pk.picked>0,hasTt=info.tid!=='N/A'&&info.tid!==''&&info.tid!=='ERR';
                const res={oid:o.id,sec:o.sec,st:info.st,sku:info.sku,qO:pk.ordered,qP:pk.picked,qC:pk.canceled,tid:info.tid,isCn,isPk,hasTt};
                allResults.push(res);
                const el=document.getElementById('r5-'+o.id);if(el) el.outerHTML=mkRow(o.id,res);
                updSum();await new Promise(rv=>setTimeout(rv,250));
            }
            if(running){$('t5st').innerHTML=`Done — ${all.length} orders checked`;$('t5tm').innerText=new Date().toLocaleTimeString();$('t5go').innerText='Re-check';}
            done();
        }

        function done(){running=false;$('t5go').style.display='inline-block';$('t5no').style.display='none';}

        function mkRow(id,r){
            if(!r) return `<div class="tc5-r" id="r5-${id}"><a class="oi" href="https://faast.amazon.co.uk/web/orders/${id}" target="_blank">${id}</a><div class="c"><span class="t t-w">...</span></div><div class="c"><span class="t t-w">...</span></div><div class="c"><span class="t t-w">...</span></div><div class="c"><span class="t t-w">...</span></div></div>`;
            let rc='',cls=[];
            let stB='';
            if(r.isCn){stB='<span class="t t-cn">CANCELLED</span>';rc='rc';cls.push('is-cancelled');}
            else if(r.sec==='packed'||r.st==='Packed') stB='<span class="t t-pk">PACKED</span>';
            else if(r.sec==='shipped'||r.st==='Shipped') stB='<span class="t t-pk">SHIPPED</span>';
            else stB=`<span class="t t-st">${(r.st||r.sec).toUpperCase()}</span>`;
            let pkB='';
            if(r.isCn) pkB='<span class="t t-cn">-</span>';
            else if(r.isPk){pkB=`<span class="t t-pk">Y ${r.qP}/${r.qO}</span>`;cls.push('is-picked');}
            else{pkB=`<span class="t t-np">X 0/${r.qO}</span>`;rc=rc||'rnp';cls.push('is-notpicked');}
            let cnB='';
            if(r.isCn) cnB='<span class="t t-cn">YES</span>';
            else if(r.qC>0) cnB=`<span class="t t-cn">${r.qC}</span>`;
            else cnB='<span class="t t-z">-</span>';
            let ttB='';
            if(r.isCn) ttB='<span class="t t-cn">-</span>';
            else if(r.hasTt){ttB='<span class="t t-ty">Y</span>';cls.push('has-tote');}
            else{ttB='<span class="t t-tn">X</span>';cls.push('no-tote');}
            return `<div class="tc5-r ${rc} ${cls.join(' ')}" id="r5-${id}"><a class="oi" href="https://faast.amazon.co.uk/web/orders/${id}" target="_blank">${id}</a><div class="c">${stB}</div><div class="c">${pkB}</div><div class="c">${cnB}</div><div class="c">${ttB}</div></div>`;
        }

        function updSum(){
            const nc=allResults.filter(r=>!r.isCn);
            $('v-tot').innerText=allResults.length;
            $('v-pk').innerText=nc.filter(r=>r.isPk).length;
            $('v-np').innerText=nc.filter(r=>!r.isPk).length;
            $('v-cn').innerText=allResults.filter(r=>r.isCn).length;
            $('v-tt').innerText=nc.filter(r=>r.hasTt).length;
            $('t5inf').innerText='Checked: '+allResults.length;
        }

        document.querySelectorAll('.tc5-fb').forEach(b=>{
            b.onclick=()=>{
                document.querySelectorAll('.tc5-fb').forEach(x=>x.classList.remove('on'));b.classList.add('on');
                const f=b.dataset.f;
                document.querySelectorAll('.tc5-r').forEach(row=>{
                    if(f==='all') row.style.display='flex';
                    else if(f==='pk') row.style.display=row.classList.contains('is-picked')?'flex':'none';
                    else if(f==='np') row.style.display=row.classList.contains('is-notpicked')?'flex':'none';
                    else if(f==='cn') row.style.display=row.classList.contains('is-cancelled')?'flex':'none';
                    else if(f==='nt') row.style.display=row.classList.contains('no-tote')?'flex':'none';
                });
            };
        });

        $('t5go').onclick=start;
        $('t5no').onclick=()=>{running=false;$('t5st').innerHTML='Stopped';done();};
        $('t5csv').onclick=()=>{
            if(!allResults.length) return;
            let csv='Order,Section,Status,SKU,Ordered,Picked,Canceled,Is_Cancelled,Is_Picked,Tracking_ID,Has_Tote\n';
            allResults.forEach(r=>{csv+=`${r.oid},${r.sec},${r.st},${r.sku},${r.qO},${r.qP},${r.qC},${r.isCn},${r.isPk},${r.tid},${r.hasTt}\n`;});
            const b=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
            const a=document.createElement('a');a.href=URL.createObjectURL(b);
            a.download=`transfer_check_${taskId}_${new Date().toISOString().slice(0,16).replace(/:/g,'-')}.csv`;a.click();
        };
    }

    if(document.readyState==='complete') setTimeout(tryInit,1500);
    else window.addEventListener('load',()=>setTimeout(tryInit,1500));
})();
