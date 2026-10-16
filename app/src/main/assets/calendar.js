export function initCalendar(i){const B=`
.calendar-container { width: 100%; }
.calendar-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.75rem; width: 100%; }
.calendar-header .nav-arrow { background: transparent; border: none; color: var(--text); font-size: 1.5rem; cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1; flex-shrink: 0; min-width: auto; width: auto; height: auto; }
.calendar-header .month-btn { flex: 1; background: transparent; border: none; color: var(--text); font-size: 1.2rem; font-weight: bold; cursor: pointer; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0.25rem 0; min-width: 0; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.25rem; }
.calendar-weekday { text-align: center; font-weight: bold; color: var(--gray); font-size: 0.75rem; }
.calendar-day { text-align: center; height: 3.5rem; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer; border: 1px solid transparent; background: var(--surface); color: var(--text); font-size: 0.875rem; box-sizing: border-box; position: relative; }
.calendar-day:hover { border-color: var(--border); }
.calendar-day.other-month { opacity: 0.3; }
.calendar-day.today { border-color: var(--accent); color: var(--accent); }
.calendar-day.selected { background: var(--accent); color: var(--accent-txt); }
.event-dots { display: flex; justify-content: center; gap: 0.15rem; margin-top: 0.2rem; min-height: 0.6rem; }
.event-dot { width: 0.4rem; height: 0.4rem; border-radius: 50%; background: var(--accent); }
.event-dot.recurring { border-radius: 0; transform: rotate(45deg); background: var(--border); }
.monthly-events { margin-top: 1.5rem; border-top: 1px dashed var(--border); padding-top: 1rem; }
.monthly-events h4 { font-size: 0.875rem; color: var(--gray); margin-bottom: 0.5rem; text-transform: uppercase; }
.monthly-event-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; padding: 0.375rem 0; border-bottom: 1px dashed rgba(255,255,255,0.1); flex-wrap: wrap; }
.monthly-event-item.completed { opacity: 0.55; text-decoration: line-through; }
.monthly-event-date { font-weight: bold; color: var(--accent); white-space: nowrap; font-size: 0.75rem; flex-shrink: 0; }
.monthly-event-text { flex: 1; min-width: 0; font-size: 0.875rem; cursor: pointer; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.recurring-today { margin-top: 1.5rem; border-top: 1px dashed var(--border); padding-top: 1rem; }
.recurring-today h4 { font-size: 0.875rem; color: var(--gray); margin-bottom: 0.5rem; text-transform: uppercase; }
.recurring-today-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; padding: 0.375rem 0; border-bottom: 1px dashed rgba(255,255,255,0.1); flex-wrap: wrap; }
.recurring-today-item.completed { opacity: 0.55; text-decoration: line-through; }
.recurring-today-text { flex: 1; min-width: 0; font-size: 0.875rem; cursor: pointer; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.recurring-today-empty { color: var(--gray); font-size: 0.875rem; padding: 0.375rem 0; }
.calendar-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; z-index: 1000; }
.calendar-modal.active { display: flex; }
.calendar-modal-content { background: var(--bg); border: 1px solid var(--border); padding: 1rem; width: 90%; max-width: 400px; max-height: 80%; overflow-y: auto; box-sizing: border-box; }
.calendar-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.calendar-modal-header h3 { font-size: 1rem; margin: 0; }
.calendar-modal-close { cursor: pointer; font-size: 1.5rem; line-height: 1; padding: 0 0.5rem; background: none; border: none; color: var(--text); width: auto; }
.calendar-event-list { list-style: none; margin: 0 0 1rem 0; padding: 0; }
.calendar-event-list li { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px dashed var(--border); flex-wrap: wrap; }
.calendar-event-list li:last-child { border-bottom: none; }
.calendar-event-list li .cal-toggle { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
.calendar-event-list li .cal-del { flex-shrink: 0; }
.calendar-add-btn { width: 100%; padding: 0.5rem; background: var(--accent); color: var(--accent-txt); border: none; font-weight: bold; cursor: pointer; box-sizing: border-box; }
.calendar-add-form textarea { width: 100%; min-height: 3rem; resize: vertical; max-height: 12rem; padding: 0.5rem; background: var(--surface); color: var(--text); border: 1px solid var(--border); font-size: 0.875rem; box-sizing: border-box; }
.calendar-add-form-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.calendar-add-form-actions button { flex: 1; padding: 0.5rem; background: var(--accent); color: var(--accent-txt); border: none; font-weight: bold; cursor: pointer; box-sizing: border-box; }
.calendar-add-form-actions button:last-child { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
`;if(!document.getElementById("calendar-component-styles")){const e=document.createElement("style");e.id="calendar-component-styles",e.textContent=B,document.head.appendChild(e)}let s=new Date,u=null;function N(e,n,r){return`${e}-${String(n+1).padStart(2,"0")}-${String(r).padStart(2,"0")}`}function z(){const e=new Date;return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`}function E(e){const n=document.createElement("div");return n.textContent=e,n.innerHTML}function D(){let e=i.calendarTabName||"Calkarui";return i.notes.filter(n=>n.category===e)}function $(e){if(e.scheduledDate){const r=e.text.replace(/^\d{4}-\d{2}-\d{2}\s+/,"");return{date:e.scheduledDate,text:r,note:e,isRecurring:!0}}let n=e.text.match(/^(\d{4}-\d{2}-\d{2})\s*([\s\S]*)$/);return n?{date:n[1],text:n[2],note:e,isRecurring:!1}:{date:null,text:e.text,note:e,isRecurring:!1}}function H(){if(document.getElementById("calendar-modal"))return;const e=document.createElement("div");e.className="calendar-modal",e.id="calendar-modal",e.innerHTML=`
      <div class="calendar-modal-content">
        <div class="calendar-modal-header">
          <h3 id="modal-date-title">Events</h3>
          <button class="calendar-modal-close" id="modal-close">\xD7</button>
        </div>
        <div id="modal-body"></div>
      </div>
    `,document.body.appendChild(e),e.querySelector("#modal-close").addEventListener("click",L),e.addEventListener("click",n=>{n.target===e&&L()})}function q(e){H();const n=document.getElementById("calendar-modal"),r=document.getElementById("modal-date-title"),x=document.getElementById("modal-body");r.textContent=`Events for ${e}`,b(e,x),n.classList.add("active"),u=e}function L(){const e=document.getElementById("calendar-modal");e&&e.classList.remove("active"),u=null,c()}function b(e,n){let p=D().map($).filter(d=>d.date===e).map(d=>`<li style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
        <span style="text-decoration:${d.note.completed?"line-through":"none"}; cursor:pointer;" data-id="${d.note.id}" class="cal-toggle">${E(d.text)}</span>
        <span style="cursor:pointer; color:var(--gray); flex-shrink:0;" data-id="${d.note.id}" class="cal-del">\u221Ad</span>
      </li>`).join("");n.innerHTML=`
      <ul class="calendar-event-list">
        ${p||"<li>No events yet</li>"}
      </ul>
      <button class="calendar-add-btn" id="add-event-btn">+</button>
    `,n.querySelectorAll(".cal-toggle").forEach(d=>{d.addEventListener("click",m=>{let g=parseInt(m.target.dataset.id,10),v=i.notes.find(h=>h.id===g);v&&(i.toggleNote(v,m),b(e,n))})}),n.querySelectorAll(".cal-del").forEach(d=>{d.addEventListener("click",m=>{let g=parseInt(m.target.dataset.id,10);i.executeTrash(g),b(e,n)})}),document.getElementById("add-event-btn").addEventListener("click",()=>{A(e,n)})}function A(e,n){n.innerHTML=`
      <div class="calendar-add-form">
        <textarea id="event-text" rows="4" placeholder="Enter event details... (prefix with !1w for recurring)"></textarea>
        <div class="calendar-add-form-actions">
          <button id="save-event">Save</button>
          <button id="cancel-event">Cancel</button>
        </div>
      </div>
    `,document.getElementById("save-event").addEventListener("click",()=>{const r=document.getElementById("event-text").value.trim();r&&(i.addNote(r,i.calendarTabName,e),i.saveData(),L())}),document.getElementById("cancel-event").addEventListener("click",()=>{b(e,n)})}function c(){const e=document.getElementById("calendar-container");if(!e)return;const n=s.getFullYear(),r=s.getMonth(),x=new Date(n,r,1),p=new Date(n,r+1,0).getDate(),d=x.getDay(),m=D(),g={},v={},h=[];for(let t=1;t<=p;t++){const a=N(n,r,t),l=m.map($).filter(o=>o.date===a);g[a]=l.length,v[a]=l.filter(o=>o.isRecurring).length,l.forEach(o=>{o.isRecurring||h.push(o)})}h.sort((t,a)=>(t.date||"").localeCompare(a.date||""));const R=`
      <div class="calendar-header">
        <button class="nav-arrow cal-prev" aria-label="Previous month">\u2190</button>
        <button class="month-btn" id="month-btn">${["January","February","March","April","May","June","July","August","September","October","November","December"][r]} ${n}</button>
        <button class="nav-arrow cal-next" aria-label="Next month">\u2192</button>
      </div>
    `,f=document.createElement("input");f.type="month",f.id="hidden-month-input",f.style.cssText="position:absolute; left:-9999px; opacity:0; width:1px; height:1px;",f.value=`${n}-${String(r+1).padStart(2,"0")}`;const F=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(t=>`<div class="calendar-weekday">${t}</div>`).join("");let w="";for(let t=0;t<d;t++)w+='<div class="calendar-day other-month"></div>';for(let t=1;t<=p;t++){const a=N(n,r,t),l=z(),o=a===l,y=a===u,T=v[a]||0,C=(g[a]||0)-T;let k="";if(T>0&&(k+='<span class="event-dot recurring"></span>'),C>0)for(let j=0;j<Math.min(C,3);j++)k+='<span class="event-dot"></span>';w+=`
        <div class="calendar-day ${o?"today":""} ${y?"selected":""}" data-date="${a}">
          <span>${t}</span>
          ${k?`<div class="event-dots">${k}</div>`:""}
        </div>
      `}const I=(d+p)%7;if(I!==0)for(let t=0;t<7-I;t++)w+='<div class="calendar-day other-month"></div>';const J=h.length>0?h.map(t=>`
          <div class="monthly-event-item ${t.note.completed?"completed":""}">
            <span class="monthly-event-date">${t.date}</span>
            <span class="monthly-event-text" data-id="${t.note.id}">${E(t.text)}</span>
          </div>
        `).join(""):'<div class="monthly-event-item"><span class="monthly-event-text">No events this month</span></div>',P=z(),S=m.map($).filter(t=>t.isRecurring&&t.date===P),O=S.length>0?S.map(t=>`
          <div class="recurring-today-item ${t.note.completed?"completed":""}">
            <span class="recurring-today-text" data-id="${t.note.id}">${E(t.text)}</span>
          </div>
        `).join(""):'<div class="recurring-today-empty">Nothing due today</div>';e.innerHTML=R+`<div class="calendar-grid">${F}${w}</div><div class="monthly-events"><h4>Events this month</h4>${J}</div><div class="recurring-today"><h4>Recurring today</h4>${O}</div>`,e.appendChild(f),e.querySelector(".cal-prev").addEventListener("click",()=>{s.setMonth(s.getMonth()-1),c()}),e.querySelector(".cal-next").addEventListener("click",()=>{s.setMonth(s.getMonth()+1),c()}),e.querySelector("#month-btn").addEventListener("click",()=>{const t=e.querySelector("#hidden-month-input");t&&(typeof t.showPicker=="function"?t.showPicker():t.click())}),e.querySelector("#hidden-month-input").addEventListener("change",t=>{const a=t.target.value;if(a){const[l,o]=a.split("-").map(Number);s=new Date(l,o-1,1),c()}}),e.querySelectorAll(".calendar-day[data-date]").forEach(t=>{t.addEventListener("click",a=>{u=a.currentTarget.dataset.date,q(u)})}),e.querySelectorAll(".monthly-event-text[data-id]").forEach(t=>{t.addEventListener("click",a=>{let l=parseInt(a.target.dataset.id,10),o=i.notes.find(y=>y.id===l);o&&(i.toggleNote(o,a),c())})}),e.querySelectorAll(".recurring-today-text[data-id]").forEach(t=>{t.addEventListener("click",a=>{let l=parseInt(a.target.dataset.id,10),o=i.notes.find(y=>y.id===l);o&&(i.toggleNote(o,a),c())})})}c();const M=document.getElementById("calendar-title");return M&&M.addEventListener("click",()=>{s=new Date,u=null,c()}),{renderCalendar:c}}
