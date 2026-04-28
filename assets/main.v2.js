(function(){'use strict';
var K='yt-archive-videos',SK='yt-archive-settings';
function L(){try{return JSON.parse(localStorage.getItem(K)||'{"videos":[]}');}catch(e){return{videos:[]};}}
function S(d){localStorage.setItem(K,JSON.stringify(d));}
function V(){return L().videos||[];}
function SV(v){var d=L();d.videos=v;S(d);}
function P(){return L().pat||'';}
function SP(t){var d=L();d.pat=t;S(d);}
function R(){return L().repo||'';}
function SR(r){var d=L();d.repo=r;S(d);}
function ST(){try{return JSON.parse(localStorage.getItem(SK)||'{}');}catch(e){return{};}}
function SST(s){localStorage.setItem(SK,JSON.stringify(s));}
var BM=false,SVids=[],CF='all',sortOrder='newest',activeTag='all',PU=null;
function E(id){return document.getElementById(id);}
function T(msg,type,dur){var c=E('toast-container');if(!c)return;type=type||'info';dur=dur||3000;var t=document.createElement('div');t.className='toast toast-'+type;t.innerHTML='<span>'+msg+'</span>';c.appendChild(t);setTimeout(function(){t.remove();},dur);}
function AT(dark){if(dark){document.documentElement.setAttribute('data-theme','dark');var tt=E('theme-toggle');if(tt)tt.textContent='☀️';}else{document.documentElement.removeAttribute('data-theme');var tt2=E('theme-toggle');if(tt2)tt2.textContent='🌙';}}
function TT(){var s=ST();s.darkMode=!s.darkMode;SST(s);AT(s.darkMode);}
var ATimer=null;
function AUI(e){var b=E('auto-sync-toggle');if(b)b.textContent=e?'Auto: ON':'Auto: OFF';}
function TA(){var s=ST();s.autoSync=!s.autoSync;SST(s);AUI(s.autoSync);if(s.autoSync)SA();else EA();T(s.autoSync?'Auto sync ON':'Auto sync OFF','info');}
function SA(){EA();ATimer=setInterval(SSync,300000);}
function EA(){if(ATimer){clearInterval(ATimer);ATimer=null;}}
function SSync(){var t=P(),r=R();if(!t||!r)return;SyncGH(V(),t,r).catch(function(){});}
function CS(){var c=E('connection-status');if(!c)return;var t=P();if(t&&t.length>20){c.textContent='Connected';c.className='status-connected';}else{c.textContent='Not Connected';c.className='status-disconnected';}}
function SyncGH(vids,token,r){var parts=r.split('/');var url='https://api.github.com/repos/'+parts[0]+'/'+parts[1]+'/contents/data/videos.json';var sha=null;return fetch(url,{headers:{'Authorization':'token '+token,'Accept':'application/vnd.github.v3+json'}}).then(function(res){if(res.ok)return res.json().then(function(d){sha=d.sha;});if(res.status===404)return null;throw new Error('Error: '+res.status);}).then(function(){var content=btoa(unescape(encodeURIComponent(JSON.stringify(vids,null,2))));var body={message:'Update: '+vids.length+' video(s)',content:content,branch:'main'};if(sha)body.sha=sha;return fetch(url,{method:'PUT',headers:{'Authorization':'token '+token,'Accept':'application/vnd.github.v3+json','Content-Type':'application/json'},body:JSON.stringify(body)});}).then(function(res){if(!res.ok)throw new Error('Sync error: '+res.status);return res.json();});}
function GID(){var c='abcdefghijklmnopqrstuvwxyz0123456789',id='';for(var i=0;i<11;i++)id+=c[Math.floor(Math.random()*c.length)];return id;}
function AV(url,tags){if(!url){T('Enter a YouTube URL','warning');return;}if(!/youtube\.com|youtu\.be/.test(url)){T('Invalid URL','error');return;}var tagList=(tags||'').split(',').map(function(t){return t.trim();}).filter(Boolean);var btn=E('add-video-btn');if(btn){btn.disabled=true;btn.textContent='...';}var vid=null;[/v=([a-zA-Z0-9_-]{11})/,/youtu\.be\/([a-zA-Z0-9_-]{11})/,/shorts\/([a-zA-Z0-9_-]{11})/].forEach(function(p){var m=url.match(p);if(m)vid=m[1];});if(!vid){T('Cannot extract ID','error');if(btn){btn.disabled=false;btn.textContent='Add';}return;}fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v='+vid+'&format=json').then(function(r){if(!r.ok)throw new Error('Fail');return r.json();}).then(function(d){var vids=V();vids.unshift({id:GID(),url:url,title:d.title||'Untitled',thumbnail:d.thumbnail_url||'https://img.youtube.com/vi/'+vid+'/hqdefault.jpg',tags:tagList,favorite:false,savedAt:new Date().toISOString()});SV(vids);var u=E('video-url-input');if(u)u.value='';var ti=E('tag-input');if(ti)ti.value='';T('Saved: '+(d.title||'Video'),'success');Rend();if(ST().autoSync)SSync();}).catch(function(){T('Error fetching','error');}).then(function(){if(btn){btn.disabled=false;btn.textContent='Add';}});}
function TF(vid){var v=V();var f=v.find(function(x){return x.id===vid;});if(f){f.favorite=!f.favorite;SV(v);}Rend();}
function DV(vid){SV(V().filter(function(v){return v.id!==vid;}));Rend();if(ST().autoSync)SSync();}
function STM(url){PU=url;var m=E('tag-modal');if(m){m.classList.add('active');m.setAttribute('aria-hidden','false');var inp=E('tag-modal-input');if(inp){inp.value='';setTimeout(function(){inp.focus();},100);}}}
function HTM(){var m=E('tag-modal');if(m){m.classList.remove('active');m.setAttribute('aria-hidden','true');}}
function CT(){var tags=(E('tag-modal-input')||{}).value||'';HTM();if(PU){AV(PU,tags);PU=null;}}
function STG(){HTM();if(PU){AV(PU,'');PU=null;}}
function DA(prefilled){if(prefilled){STM(prefilled);return;}var u=(E('video-url-input')||{}).value||'';var t=(E('tag-input')||{}).value||'';AV(u.trim(),t.trim());}

function getAllTags(){var tags={};V().forEach(function(v){(v.tags||[]).forEach(function(t){t=t.trim().toLowerCase();if(t){tags[t]=(tags[t]||0)+1;}});});return Object.keys(tags).sort();}

function updateTagBar(){var tc=E('tag-categories');if(!tc)return;var tags=getAllTags();if(tags.length===0){tc.style.display='none';return;}tc.style.display='flex';var html='<span class="filter-label">Tags:</span><button class="tag-cat-btn'+(activeTag==='all'?' active':'')+'" data-tag="all">All</button>';tags.forEach(function(t){html+='<button class="tag-cat-btn'+(activeTag===t?' active':'')+'" data-tag="'+t+'">#'+t+'</button>';});tc.innerHTML=html;tc.querySelectorAll('.tag-cat-btn').forEach(function(b){b.addEventListener('click',function(){activeTag=this.dataset.tag;updateTagBar();Rend();});});}

function Filt(){
  var v=V();
  if(activeTag!=='all'){v=v.filter(function(x){return(x.tags||[]).map(function(t){return t.trim().toLowerCase();}).indexOf(activeTag)!==-1;});}
  if(CF==='favorites')v=v.filter(function(x){return x.favorite;});
  else if(CF!=='all'){var now=new Date(),cutoff;if(CF==='today')cutoff=new Date(now.getFullYear(),now.getMonth(),now.getDate());else if(CF==='week')cutoff=new Date(now.getTime()-7*86400000);else if(CF==='month')cutoff=new Date(now.getFullYear(),now.getMonth(),1);v=v.filter(function(x){return new Date(x.savedAt)>=cutoff;});}
  if(sortOrder==='oldest'){v.sort(function(a,b){return new Date(a.savedAt)-new Date(b.savedAt);});}
  else{v.sort(function(a,b){return new Date(b.savedAt)-new Date(a.savedAt);});}
  return v;
}
function Rend(){
  var grid=E('video-grid');if(!grid)return;
  var q=(E('search-input')||{}).value||'';var v=Filt();
  if(q){q=q.toLowerCase();v=v.filter(function(x){return x.title.toLowerCase().indexOf(q)!==-1||(x.tags||[]).some(function(t){return t.toLowerCase().indexOf(q)!==-1;});});}
  var vc=E('video-count');if(vc)vc.textContent=v.length;grid.innerHTML='';
  var es=E('empty-state');if(v.length===0){if(es)es.style.display='block';return;}if(es)es.style.display='none';
  v.forEach(function(x){
    var card=document.createElement('div');
    card.className='video-card'+(x.favorite?' favorite':'')+(BM&&SVids.indexOf(x.id)>-1?' selected':'');
    var tagsHtml='';if(x.tags&&x.tags.length){tagsHtml='<div class="video-tags">'+x.tags.map(function(t){return'<span class="tag tag-clickable" data-tag="'+t.trim().toLowerCase()+'">#'+Esc(t)+'</span>';}).join('')+'</div>';}
    card.innerHTML=(BM?'<input type="checkbox" class="bulk-checkbox" data-id="'+x.id+'"'+(SVids.indexOf(x.id)>-1?' checked':'')+'>':'')+'<a href="'+x.url+'" target="_blank" rel="noopener" class="video-card-link"><img src="'+x.thumbnail+'" alt="" class="video-thumbnail" loading="lazy" /><div class="video-info"><h3 class="video-title">'+Esc(x.title)+'</h3>'+tagsHtml+'<p class="video-date">'+new Date(x.savedAt).toLocaleDateString()+'</p></div></a><div class="video-actions"><button class="btn-fav" data-id="'+x.id+'">'+(x.favorite?'⭐':'☆')+'</button><button class="btn-del" data-id="'+x.id+'" data-title="'+Esc(x.title)+'">🗑️</button></div>';
    grid.appendChild(card);
  });
  grid.querySelectorAll('.btn-fav').forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();TF(this.dataset.id);};});
  grid.querySelectorAll('.btn-del').forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();if(confirm('Delete "'+this.dataset.title+'"?'))DV(this.dataset.id);};});
  grid.querySelectorAll('.tag-clickable').forEach(function(t){t.onclick=function(e){e.preventDefault();e.stopPropagation();activeTag=this.dataset.tag;CF='all';updateUI();updateTagBar();Rend();};});
  grid.querySelectorAll('.bulk-checkbox').forEach(function(cb){cb.onchange=function(){var id=this.dataset.id,idx=SVids.indexOf(id);if(idx>-1)SVids.splice(idx,1);else SVids.push(id);UB();var card=this.closest('.video-card');if(card)card.classList.toggle('selected',SVids.indexOf(id)>-1);};});
}
function Esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function SF(f){CF=f;if(f!=='favorites')activeTag='all';updateUI();updateTagBar();Rend();}
function setSort(order){sortOrder=order;document.querySelectorAll('[data-sort]').forEach(function(b){b.classList.remove('active');});var btn=document.querySelector('[data-sort="'+order+'"]');if(btn)btn.classList.add('active');Rend();}
function updateUI(){document.querySelectorAll('[data-filter]').forEach(function(b){b.classList.remove('active');});var btn=document.querySelector('[data-filter="'+CF+'"]');if(btn)btn.classList.add('active');var labels={all:'All Time',today:'Today',week:'This Week',month:'This Month',favorites:'⭐ Favorites'};var fl=E('date-filter-label');if(fl)fl.textContent=labels[CF]||'All Time';}
function TB(){BM=!BM;SVids=[];UB();Rend();if(!BM){var bb=E('bulk-action-bar');if(bb)bb.style.display='none';}}
function UB(){var bb=E('bulk-action-bar');if(!bb)return;if(BM){bb.style.display='flex';var bc=E('bulk-count');if(bc)bc.textContent=SVids.length?SVids.length+' selected':'Click videos to select';}else{bb.style.display='none';}}
function BDel(){if(!SVids.length){T('Select videos first','warning');return;}var c=SVids.length;if(!confirm('Delete '+c+' video(s)?'))return;SV(V().filter(function(v){return SVids.indexOf(v.id)===-1;}));SVids=[];BM=false;UB();Rend();T('Deleted '+c+' video(s)!','success');}
function BFav(){if(!SVids.length){T('Select videos first','warning');return;}var c=SVids.length;var v=V();v.forEach(function(x){if(SVids.indexOf(x.id)>-1)x.favorite=true;});SV(v);SVids=[];BM=false;UB();Rend();T('Favorited '+c+' video(s)!','success');}
function BCan(){BM=false;SVids=[];UB();Rend();}
function Exp(){var data=JSON.stringify(L(),null,2);var blob=new Blob([data],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='yt-archive-'+new Date().toISOString().split('T')[0]+'.json';a.click();}
function Imp(file){var reader=new FileReader();reader.onload=function(e){try{var imported=JSON.parse(e.target.result);var existing=L();if(!imported.videos&&Array.isArray(imported))imported={videos:imported};imported.videos=imported.videos||[];var count=0;imported.videos.forEach(function(v){if(!existing.videos.some(function(x){return x.id===v.id||x.url===v.url;})){existing.videos.push(v);count++;}});if(imported.pat&&!existing.pat)existing.pat=imported.pat;if(imported.repo&&!existing.repo)existing.repo=imported.repo;S(existing);CS();T('Imported '+count+' video(s)!','success');Rend();}catch(err){T('Invalid file','error');}};reader.readAsText(file);}
function MSync(){var t=P(),r=R();if(!t||!r){T('Set up GitHub in Settings first','warning');OS();return;}T('Syncing...','info');SyncGH(V(),t,r).then(function(){T('Synced!','success');}).catch(function(err){T(err.message,'error');});}
function OS(){var m=E('settings-modal');if(!m)return;m.classList.add('active');m.setAttribute('aria-hidden','false');var pi=E('pat-input');if(pi)pi.value=P();var ri=E('repo-input');if(ri)ri.value=R();var tr=E('test-result');if(tr){tr.textContent='';tr.className='';}}
function CS(){var m=E('settings-modal');if(m){m.classList.remove('active');m.setAttribute('aria-hidden','true');}}
function SSM(){var p=((E('pat-input')||{}).value||'').trim();var r=((E('repo-input')||{}).value||'').trim();if(!p){T('Token required','warning');return;}SP(p);SR(r);CS();CST();T('Settings saved!','success');}
function CST(){var c=E('connection-status');if(!c)return;var t=P();if(t&&t.length>20){c.textContent='Connected';c.className='status-connected';}else{c.textContent='Not Connected';c.className='status-disconnected';}}
function TC(){var p=((E('pat-input')||{}).value||'').trim();if(!p)return;var btn=E('test-connection-btn');if(btn){btn.disabled=true;btn.textContent='...';}var tr=E('test-result');if(tr){tr.textContent='';tr.className='';}fetch('https://api.github.com/user',{headers:{'Authorization':'token '+p,'Accept':'application/vnd.github.v3+json'}}).then(function(r){if(r.ok)return r.json().then(function(d){if(tr){tr.textContent=d.login;tr.className='success';}});if(tr){tr.textContent='Auth failed';tr.className='error';}}).catch(function(){if(tr){tr.textContent='Network error';tr.className='error';}}).then(function(){if(btn){btn.disabled=false;btn.textContent='Test Connection';}});}
function Init(){
  var s=ST();AT(s.darkMode||false);AUI(s.autoSync||false);if(s.autoSync)SA();CST();
  var ab=E('add-video-btn');if(ab)ab.addEventListener('click',function(){DA();});
  var vu=E('video-url-input');if(vu)vu.addEventListener('keypress',function(e){if(e.key==='Enter')DA();});
  var si=E('search-input');if(si)si.addEventListener('input',Rend);
  var tt=E('theme-toggle');if(tt)tt.addEventListener('click',TT);
  var at=E('auto-sync-toggle');if(at)at.addEventListener('click',TA);
  var tms=E('tag-modal-save');if(tms)tms.addEventListener('click',CT);
  var tmk=E('tag-modal-skip');if(tmk)tmk.addEventListener('click',STG);
  var tmc=E('tag-modal-close');if(tmc)tmc.addEventListener('click',STG);
  var tm=E('tag-modal');if(tm){var tmo=tm.querySelector('.modal-overlay');if(tmo)tmo.addEventListener('click',STG);}
  document.querySelectorAll('[data-filter]').forEach(function(b){b.addEventListener('click',function(){SF(this.dataset.filter);});});
  document.querySelectorAll('[data-sort]').forEach(function(b){b.addEventListener('click',function(){setSort(this.dataset.sort);});});
  var bmb=E('bulk-mode-btn');if(bmb)bmb.addEventListener('click',TB);
  var bdb=E('bulk-delete-btn');if(bdb)bdb.addEventListener('click',BDel);
  var bfb=E('bulk-favorite-btn');if(bfb)bfb.addEventListener('click',BFav);
  var bcb=E('bulk-cancel-btn');if(bcb)bcb.addEventListener('click',BCan);
  var exb=E('export-btn');if(exb)exb.addEventListener('click',function(){Exp();T('Exported!','success');});
  var imb=E('import-btn');if(imb)imb.addEventListener('click',function(){var f=E('import-file');if(f)f.click();});
  var imf=E('import-file');if(imf)imf.addEventListener('change',function(e){if(e.target.files[0]){Imp(e.target.files[0]);e.target.value='';}});
  var st=E('settings-trigger');if(st)st.addEventListener('click',OS);
  var sc=E('settings-close');if(sc)sc.addEventListener('click',CS);
  var scc=E('settings-cancel');if(scc)scc.addEventListener('click',CS);
  var ss=E('settings-save');if(ss)ss.addEventListener('click',SSM);
  var tcb=E('test-connection-btn');if(tcb)tcb.addEventListener('click',TC);
  var sm=E('settings-modal');if(sm){var smo=sm.querySelector('.modal-overlay');if(smo)smo.addEventListener('click',CS);}
  var syb=E('sync-btn');if(syb)syb.addEventListener('click',MSync);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){var tm2=E('tag-modal');if(tm2&&tm2.classList.contains('active'))STG();var sm2=E('settings-modal');if(sm2&&sm2.classList.contains('active'))CS();}});
  window.addEventListener('online',function(){var b=E('offline-banner');if(b)b.style.display='none';});
  window.addEventListener('offline',function(){var b=E('offline-banner');if(b)b.style.display='block';});
  if(!navigator.onLine){var b2=E('offline-banner');if(b2)b2.style.display='block';}
  updateTagBar();Rend();
  var params=new URLSearchParams(window.location.search);var urlParam=params.get('url');
  if(urlParam){var cleanUrl=decodeURIComponent(urlParam).split('&')[0];var vu2=E('video-url-input');if(vu2)vu2.value=cleanUrl;var wait=setInterval(function(){var ab2=E('add-video-btn');if(ab2&&!ab2.disabled){clearInterval(wait);DA(cleanUrl);}},200);setTimeout(function(){clearInterval(wait);},5000);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',Init);else Init();
})();
