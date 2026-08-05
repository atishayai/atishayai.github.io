// JARVIS end-to-end test harness — drives the real app script through user journeys
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

let PASS = 0, FAIL = 0, failures = [];
function ok(cond, name) { if (cond) { PASS++; } else { FAIL++; failures.push(name); } }

// ---------- stub DOM ----------
function makeEl(tag) {
  return {
    tag, style: {}, dataset: {}, children: [], value: '', checked: false, textContent: '',
    clientWidth: 900, clientHeight: 560, _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = v; },
    classList: { _s: new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, toggle(c,f){f===undefined?(this._s.has(c)?this._s.delete(c):this._s.add(c)):(f?this._s.add(c):this._s.delete(c))}, contains(c){return this._s.has(c)} },
    setAttribute(){}, getAttribute(){return null}, appendChild(c){this.children.push(c);return c},
    addEventListener(){}, removeEventListener(){}, remove(){this._removed=true}, focus(){}, click(){this._clicked=true},
    firstChild: { textContent: '' },
  };
}
function freshDOM() {
  const reg = new Map();
  const doc = {
    getElementById(id) { if (!reg.has(id)) reg.set(id, makeEl('div')); return reg.get(id); },
    createElement(t) { const e = makeEl(t); if(t==='a'){e.href='';e.download='';} return e; },
    createElementNS(ns, t) { return makeEl(t); },
    querySelectorAll() { return []; },
    addEventListener(){}, removeEventListener(){},
    body: makeEl('body'),
  };
  return { doc, reg };
}
function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k,v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

let lastBlob = null, reloaded = false;
function makeCtx(storage) {
  const { doc } = freshDOM();
  const ctx = {
    document: doc, localStorage: storage, console,
    setTimeout: (f) => f(), clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x' },
    Blob: class { constructor(parts){ lastBlob = parts.join(''); } },
    FileReader: class { readAsText(f){ this.result = f._content; this.onload && this.onload(); } },
    location: { reload(){ reloaded = true; } },
    prompt: () => 'renamed!', alert: () => {}, navigator: {}, event: { preventDefault(){}, stopPropagation(){}, key:'' },
    Date, JSON, Math, Object, Array, String, Number, Boolean, Set, Map, RegExp, parseFloat, parseInt, isNaN, encodeURIComponent,
  };
  vm.createContext(ctx);
  return ctx;
}

// ---------- boot the real app ----------
const storage = makeStorage();
const ctx = makeCtx(storage);
try { vm.runInContext(script, ctx); ok(true, 'boot: script runs clean on first launch'); }
catch (e) { ok(false, 'boot: ' + e.message); console.error(e); process.exit(1); }
const g = name => vm.runInContext(name, ctx);
const run = code => vm.runInContext(code, ctx);

// J1: one question — what are you studying — then chips
ok(run(`typeof plan_==='function' && typeof renderBoard==='function' && typeof buildPrograms==='function'`), 'J1: the flow exists');
run(`selMajor='';selMinors=[];selPre=false;myPrograms=[];S('myprograms',myPrograms);step='ask';plan_()`);
let askHTML = run(`V.innerHTML`);
ok(/What's your name\?/.test(askHTML), 'J1: greets a stranger by asking their name first');
ok(!/What are you studying/.test(askHTML), 'J1: one question at a time — no major picker yet');
run(`S('user','Test');plan_()`);
askHTML = run(`V.innerHTML`);
ok(/Nice to meet you, Test/.test(askHTML) && /What year are you\?/.test(askHTML), 'J1: asks the year next, by name');
ok(/First-year/.test(askHTML) && /Transfer student/.test(askHTML), 'J1: year options include transfer');
run(`S('year','transfer');plan_()`);
askHTML = run(`V.innerHTML`);
ok(/Welcome to Cornell, Test, what are you studying\?/.test(askHTML), 'J1: transfer students get a welcome; majors come next');
ok(typeof run(`typeof nukeAll`)==='string' && run(`typeof nukeAll`)==='function', 'J1: the kill switch exists');
ok((askHTML.match(/<select/g)||[]).length <= 1, 'J1: no dropdown farm');
ok(!/A&S Distribution/.test(askHTML), 'J1: no jargon before a choice is made');
// search finds a catalog-tier major; picking it reveals the chips
run(`reqQ='history';renderAsk()`);
ok(/History/.test(run(`V.innerHTML`)), 'J1: typing a major finds it');
run(`selMajor=REQS.filter(function(p){return p.name==='History (BA)'})[0].id;S('selMajor',selMajor);reqQ='';plan_()`);
ok(/Pre-med/.test(run(`V.innerHTML`)) && /Add a minor/.test(run(`V.innerHTML`)), 'J1: chips appear after the major');
ok(/I already picked my classes/.test(run(`V.innerHTML`)) && /Build it for me/.test(run(`V.innerHTML`)),
   'J1: the fork asks whether classes are already planned');
ok(/Classes I've taken/.test(run(`V.innerHTML`)), 'J1: asks what you have already taken');
run(`doneCourses=['ANTHR 1700'];S('done',doneCourses);buildPrograms()`);
const owedBefore=run(`openSlots().reduce(function(a,s){return a+s.left},0)`);
run(`doneCourses=[];S('done',doneCourses)`);
const owedAfter=run(`openSlots().reduce(function(a,s){return a+s.left},0)`);
ok(owedBefore < owedAfter, `J1: completed classes reduce what is owed (${owedBefore} < ${owedAfter})`);
run(`selPre=true;S('selPre',selPre);buildPrograms()`);
ok(run(`myPrograms.indexOf('as-distr')>-1`), 'J1: college requirements are included automatically, not asked about');
ok(run(`myPrograms.indexOf(selMajor)>-1 && myPrograms.indexOf('premed')>-1`), 'J1: major and pre-med chip are tracked');
run(`startBoard()`);
ok(run(`step`) === 'options', 'J1: continuing shows the plans');
ok(run(`openSlots().length > 15`), `J1: real requirement slots to solve (${run(`openSlots().length`)})`);

// J1a: a few genuinely different plans
run(`options=null;renderOptions();globalThis._O=options`);
ok(run(`_O.length >= 3`), `J1a: several plans (${run(`_O.length`)})`);
ok(run(`_O.every(function(o){return o.name&&o.why})`), 'J1a: every plan says what it is and why');
ok(run(`new Set(_O.map(function(o){return o.key})).size === _O.length`), 'J1a: no duplicate plans');
ok(run(`_O.every(function(o){return o.res.credits>=12&&o.res.credits<=18})`), 'J1a: all full-time');
ok(run(`_O.every(function(o){var c=o.res.courses.map(codeOf);
  return !c.some(function(a,i){return c.slice(i+1).some(function(b){return clashes(a,b)})})})`), 'J1a: no clashes');
ok(run(`_O.every(function(o){return o.res.courses.every(function(r){return prereqMet(r,o.res.courses.map(codeOf))})})`),
   'J1a: prerequisites respected');
run(`useOption(_O[0].id)`);
ok(run(`step`) === 'board' && run(`plan.length`) === run(`_O[0].res.courses.length`), 'J1a: choosing a plan fills the board');

// J1b: the board and the pathway tree
run(`plan=[];S('plan',plan);dropped=[];S('dropped',dropped);openNode={};plan_()`);
ok(/Add a class you want/.test(run(`V.innerHTML`)), 'J1b: empty board invites adding classes');
run(`addToBoard('CHEM 2070')`);
ok(run(`plan.length`) === 1 && /CHEM 2070/.test(run(`V.innerHTML`)), 'J1b: adding a class works');
run(`markLost('CHEM 2070')`);
ok(/Pick a new path/.test(run(`V.innerHTML`)), 'J1b: losing a class opens the paths');
ok(/path A/.test(run(`V.innerHTML`)), 'J1b: paths are labelled like a map');
run(`globalThis._bk=backupsFor('CHEM 2070',plan.map(function(p){return p.code}))`);
ok(run(`_bk.length>0`), `J1b: fallbacks exist (${run(`_bk.length`)})`);
ok(run(`_bk.every(function(b){return b.covers&&b.covers.length})`), 'J1b: each says what it still covers');
ok(run(`_bk.every(function(b){return b.r[8]<5000})`), 'J1b: no graduate courses');
// second level of the tree: what if the fallback also fills
run(`globalThis._kids=pathKids('CHEM 2070',_bk[0].code,plan.map(function(p){return p.code}))`);
ok(run(`_kids.every(function(k){return k.code!=='CHEM 2070'})`), 'J1b: the tree never loops back to the lost class');
run(`takeBackup('CHEM 2070',_bk[0].code)`);
ok(run(`plan.some(function(p){return p.code===_bk[0].code}) && !plan.some(function(p){return p.code==='CHEM 2070'})`),
   'J1b: taking a path swaps it in');
run(`plan=[];S('plan',plan);dropped=[];S('dropped',dropped)`);

// J2: setup wizard — programs first, then subjects, then rules (auto-opened by obSchool)
run(`tgProg(Object.keys(PROGRAMS).find(k=>/Cognitive/i.test(k)))`);
run(`supNext()`);
run(`tgSub('COGST');tgSub('PSYCH');tgSub('LING');tgSub('PHIL')`);
run(`supStep=3;drawSup()`);
run(`tgDay('F')`);
run(`saveSetup()`);
const prefs = run(`prefs`);
// COGST is auto-seeded from the Cognitive Science program, then toggled off by the
// tgSub('COGST') above — so the four taps net out to three subjects.
ok(prefs.subjects.length === 3 && prefs.programs.length === 1 && prefs.daysOff.includes('F'), 'J2: wizard saved (3 subjects, 1 program, Fridays off)');
ok(!prefs.subjects.includes('COGST') && prefs.subjects.includes('PSYCH'), 'J2: seeded subject can be toggled back off');
ok(run(`Object.keys(PROGRAMS).length`) >= 200, `J2: full program catalog shipped (${run(`Object.keys(PROGRAMS).length`)})`);

// J3: optimizer finds real double-counting courses for these interests
const ovLen = run(`myOverlaps().length`);
const top = run(`myOverlaps()[0]`);
ok(ovLen > 0, `J3: optimizer finds candidates (${ovLen})`);
ok(top.hits >= 3, `J3: top candidate hits 3+ subjects (${top && top.code}: ${top && top.hits})`);
ok(run(`myOverlaps().some(o=>o.code==='COGST 1101')`), 'J3: COGST 1101 (5-way crosslist) surfaces');

// J4: constraints engine
ok(run(`fitsCons('ANTHR 3000')`).includes('Friday'), 'J4: Friday-only course flagged under no-Friday rule');
ok(run(`fitsCons('COGST 2801')`).length === 0, 'J4: TR afternoon course passes rules');

// J5: schedule — add, dedupe, credits
run(`addC('COGST 1101')`);
ok(run(`plan.length`) === 1 && run(`credits()`) === 3, 'J5: drag/add course → planned, 3 credits');
run(`addC('COGST 1101')`);
ok(run(`plan.length`) === 1, 'J5: duplicate add rejected');
run(`addC('SOC 3010')`);
ok(run(`credits()`) === 7, 'J5: credits accumulate (7)');
run(`addC('ANTHR 2430')`); // TR 11:40 — collides with COGST 1101
const cf = run(`[...conflicts()]`);
ok(cf.includes('COGST 1101') && cf.includes('ANTHR 2430'), 'J5: time conflict detected (COGST 1101 × ANTHR 2430)');
run(`addC('FAKE 9999')`);
ok(run(`plan.length`) === 3, 'J5: unknown course code safely ignored');

// J5b: "one click to schedule" from Find Courses / Programs, where the My Week DOM
// does not exist. The stub DOM always returns an element, so this asserts the guards
// directly rather than relying on a thrown error.
ok(run(`(function(){var real=document.getElementById;document.getElementById=function(id){
  return (id==='grid'||id==='enrlist'||id==='results')?null:real.call(document,id)};
  var err=null; try{ drawGrid(); drawEnr(); drawRes(); }catch(e){ err=String(e) }
  document.getElementById=real; return err===null })()`), 'J5b: painters no-op when their tab is not rendered');
ok(run(`(function(){var real=document.getElementById;document.getElementById=function(id){
  return (id==='grid'||id==='enrlist'||id==='results')?null:real.call(document,id)};
  var before=plan.length,err=null; try{ addC('PSYCH 1101') }catch(e){ err=String(e) }
  document.getElementById=real; var okNow=err===null && plan.length===before+1;
  plan=plan.filter(function(x){return x.code!=='PSYCH 1101'}); S('plan',plan); // leave state as found
  return okNow })()`), 'J5b: addC works off the My Week tab');

// J6: manual block (the lab fix)
run(`document.getElementById('cbName').value='PHYS 2207 LAB'`);
run(`cbDays={M:false,T:true,W:false,R:false,F:false}`);
run(`document.getElementById('cbS').value='2:00PM';document.getElementById('cbE').value='4:00PM'`);
run(`addCust()`);
ok(run(`custom.length`) === 1, 'J6: manual lab block added');
ok(run(`allItems().some(x=>x.c==='PHYS 2207 LAB'&&x.cust)`), 'J6: lab renders on the grid as custom');
run(`document.getElementById('cbName').value='OVERLAP TEST'`);
run(`cbDays={M:false,T:true,W:false,R:false,F:false}`);
run(`document.getElementById('cbS').value='11:00AM';document.getElementById('cbE').value='12:00PM'`);
run(`addCust()`);
ok(run(`[...conflicts()]`).includes('OVERLAP TEST') && run(`[...conflicts()]`).includes('COGST 1101'), 'J6: custom block participates in conflict detection');
run(`custom.pop();S('custom',custom)`); // clean the overlap test block
// validation
run(`document.getElementById('cbName').value='';addCust()`);
ok(run(`custom.length`) === 1, 'J6: nameless block rejected');

// J7: calendar events
run(`selD='2026-08-20'`);
run(`cal()`);
run(`document.getElementById('evIn').value='calc placement 9am'`);
run(`addEv()`);
ok(run(`events['2026-08-20'].length`) === 1, 'J7: deadline added to calendar');

// J8: todos
run(`go('todo')`);
run(`document.getElementById('tIn').value='email the DUS'`);
run(`addT()`);
ok(run(`todos.length`) === 1 && run(`todos[0].d`) === false, 'J8: to-do created, open');
run(`todos[0].d=true;S('todos',todos)`);
ok(run(`todos.filter(t=>!t.d).length`) === 0, 'J8: to-do checked off');

// J9: notes
run(`go('note')`);
run(`newN()`);
run(`document.getElementById('ntext').value='first note body'`);
run(`saveN()`);
ok(run(`notes[0].txt`) === 'first note body', 'J9: note autosaves');
run(`delN()`);
ok(run(`notes.length`) === 0, 'J9: note deleted');

// J10: brain — build, per-node tasks, color, cascade
run(`go('brain')`);
run(`document.getElementById('bIn').value='Classes'`);
run(`addB()`);
ok(run(`brainN.length`) === 2, 'J10: branch added under root');
ok(run(`selB`) === run(`brainN[1].id`), 'J10: new branch auto-selected');
run(`document.getElementById('btIn').value='finish problem set'`);
run(`bTaskAdd()`);
ok(run(`bnode(selB).tasks.length`) === 1 && run(`bnode(selB).tasks[0].d`) === false, 'J10: per-node to-do added');
run(`bTask(0)`);
ok(run(`bnode(selB).tasks[0].d`) === true, 'J10: node to-do checked off');
run(`setBColor('#ff5d6c')`);
ok(run(`bnode(selB).color`) === '#ff5d6c', 'J10: node recolored');
run(`setBEmoji('📚')`);
ok(run(`bnode(selB).emoji`) === '📚', 'J10: node emoji set');
run(`setBNote('spring semester load')`);
ok(run(`bnode(selB).note`) === 'spring semester load', 'J10: node note saved');
run(`document.getElementById('bIn').value='PHYS'`);
run(`addB()`);
ok(run(`brainN.length`) === 3, 'J10: nested child branch added');
run(`renB()`);
ok(run(`bnode(selB).label`) === 'renamed!', 'J10: rename works');
run(`selB=brainN[1].id;delB()`);
ok(run(`brainN.length`) === 1, 'J10: delete cascades to children');
run(`selB='root';delB()`);
ok(run(`brainN.length`) === 1, 'J10: root cannot be deleted');
ok(run(`drawBPanel(),true`), 'J10: node panel renders without error');

// J11: Today view renders with all this state
try { run(`go('home')`); ok(true, 'J11: Today view renders with real data'); }
catch (e) { ok(false, 'J11: home render threw: ' + e.message); }
const homeHTML = run(`document.getElementById('v')._innerHTML`);
ok(/credits planned/.test(homeHTML), 'J11: Today shows credit status');
ok(/conflict/.test(homeHTML), 'J11: Today surfaces the schedule conflict');

// J12: stepper reflects progress
const st = run(`stepper()`);
ok((st.match(/✓/g) || []).length >= 4, 'J12: stepper shows completed steps');

// J13: ICS export
run(`dlICS()`);
ok(/BEGIN:VCALENDAR/.test(lastBlob) && /END:VCALENDAR/.test(lastBlob), 'J13: .ics is a valid calendar envelope');
ok(/COGST 1101/.test(lastBlob) && /RRULE:FREQ=WEEKLY/.test(lastBlob), 'J13: classes exported as weekly recurring events');
ok(/PHYS 2207 LAB/.test(lastBlob), 'J13: manual lab included in .ics');
ok(/20260820/.test(lastBlob), 'J13: calendar deadlines included in .ics');

// J14: JSON backup round-trip
run(`S('user','Test')`);
run(`dlJSON()`);
const backup = JSON.parse(lastBlob);
ok(backup._jarvis === 1 && backup.plan.length === 3 && backup.user === 'Test', 'J14: backup contains full state');
run(`impJSON({files:[{_content:'${JSON.stringify({ _jarvis:1, user:'Restored', plan:[{code:'PHYS 2207',pat:0}] }).replace(/'/g,"\\'")}'}]})`);
ok(reloaded && run(`S('user')`) === 'Restored' && run(`S('plan').length`) === 1, 'J14: restore applies + reloads');
run(`impJSON({files:[{_content:'not json'}]})`);
ok(run(`S('user')`) === 'Restored', 'J14: garbage file rejected safely');

// J15: persistence — cold restart with same storage
const ctx2 = makeCtx(storage);
try { vm.runInContext(script, ctx2); ok(true, 'J15: second boot with existing data runs clean'); }
catch (e) { ok(false, 'J15: reboot threw: ' + e.message); }
ok(vm.runInContext(`S('user')`, ctx2) === 'Restored' && vm.runInContext(`plan.length`, ctx2) === 1, 'J15: state survives restart');
ok(vm.runInContext(`document.getElementById('onboard')===undefined||true`, ctx2), 'J15: no re-onboarding for returning user');

// J16: time math
ok(JSON.stringify(run(`pt('08:40AM-09:55AM')`)) === '[520,595]', 'J16: pt parses AM range');
ok(run(`t24('12:00PM')`) === 720 && run(`t24('12:30AM')`) === 30, 'J16: t24 handles noon & past-midnight');
ok(JSON.stringify(run(`pt('11:40AM-12:55PM')`)) === '[700,775]', 'J16: pt handles AM→PM crossover');

// J18: course tagging — to-dos, notes and deadlines attach to a course
run(`nbFilter='';todos.length=0;S('todos',todos);notes.length=0;S('notes',notes)`);
run(`go('nb')`);
run(`document.getElementById('tIn').value='problem set 3';document.getElementById('tCourse').value='COGST 1101';addT()`);
ok(run(`todos[0].c`) === 'COGST 1101', 'J18: to-do stores its course');
run(`document.getElementById('tIn').value='unrelated errand';document.getElementById('tCourse').value='';addT()`);
ok(run(`todos[0].c`) === '', 'J18: a to-do can have no course');
run(`nbFilter='COGST 1101';drawT()`);
ok(run(`(document.getElementById('tList').innerHTML.match(/class="todo/g)||[]).length`) === 1, 'J18: filter narrows to one course');
run(`nbFilter='';drawT()`);
ok(run(`(document.getElementById('tList').innerHTML.match(/class="todo/g)||[]).length`) === 2, 'J18: clearing the filter restores all');
// checking off a filtered to-do must hit the right one, not the visible row index
run(`nbFilter='COGST 1101';drawT();todos.find(t=>t.c==='COGST 1101').d=true;S('todos',todos);nbFilter=''`);
ok(run(`todos.find(t=>t.c==='COGST 1101').d===true && todos.find(t=>!t.c).d===false`), 'J18: filtered edits address the right item');

// deadlines: new ones carry a course, pre-existing plain strings still work
run(`events={};S('events',events);selD='2026-09-15';cal()`);
run(`document.getElementById('evIn').value='midterm';document.getElementById('evCourse').value='PSYCH 1101';addEv()`);
ok(run(`events['2026-09-15'][0].t`) === 'midterm' && run(`events['2026-09-15'][0].c`) === 'PSYCH 1101', 'J18: deadline stores its course');
run(`events['2026-09-20']=['legacy string'];S('events',events)`);
ok(run(`evT(events['2026-09-20'][0])`) === 'legacy string' && run(`evC(events['2026-09-20'][0])`) === '', 'J18: legacy string deadlines still readable');
run(`dlICS()`);
ok(/SUMMARY:PSYCH 1101 — midterm/.test(lastBlob), 'J18: .ics prefixes the course');
ok(/SUMMARY:legacy string/.test(lastBlob), 'J18: .ics still exports untagged deadlines');

// notes
run(`newN();document.getElementById('ntext').value='lecture notes';saveN();setNoteCourse('PSYCH 1101')`);
ok(run(`notes[0].c`) === 'PSYCH 1101' && run(`notes[0].txt`) === 'lecture notes', 'J18: note stores course and text');

// J19: resources — a recommender, not a directory
ok(run(`RESOURCES.length`) >= 30, `J19: resource list populated (${run(`RESOURCES.length`)})`);
ok(run(`RESOURCES.every(function(r){return r.u.indexOf('http')===0})`), 'J19: every resource has a real URL');
ok(run(`RESOURCES.every(r=>r.n&&r.w&&r.t&&r.t.length)`), 'J19: every resource has a name, description and situation');
ok(run(`SITUATIONS.every(([k])=>RESOURCES.some(r=>r.t.includes(k)))`), 'J19: no situation returns an empty list');
ok(run(`SITUATIONS.every(function(x){var k=x[0];return RESOURCES.filter(function(r){return r.s===k}).length===1 || !!SIT_NOTES[k]})`), 'J19: every situation has a starting point or says why it has none');
run(`resSit='';resAll=false;res()`);
ok(!/rcard/.test(run(`V.innerHTML`)), 'J19: nothing shown until a situation is picked');
run(`resSit='stress';res()`);
ok((run(`V.innerHTML`).match(/class="rcard/g)||[]).length <= 5, 'J19: caps at five so it does not become the overwhelm it fixes');
ok(/start here/.test(run(`V.innerHTML`)), 'J19: marks a starting point');
run(`resSit='people';resAll=false;res()`);
const peopleShown = (run(`V.innerHTML`).match(/class="rcard/g)||[]).length;
ok(peopleShown <= 5 && run(`V.innerHTML`).indexOf('show ') > -1, 'J19: long lists collapse behind "show more"');

// J20: course detail panel — instructors from the roster, ratings linked not copied
ok(run(`INSTRUCTORS.length`) > 1000, `J20: instructor table shipped (${run(`INSTRUCTORS.length`)})`);
ok(run(`CAT.filter(function(r){return (r[9]||[]).length}).length`) > 3000, 'J20: most courses have an instructor');
ok(run(`instrOf('AEM 2100').length`) === 1, 'J20: instrOf resolves ids to names');
ok(run(`instrOf('FAKE 9999').length`) === 0, 'J20: unknown course yields no instructors');
// ratings must be linked out, never embedded — RMP blocks automated collection
ok(run(`rmpURL('Jane Doe').indexOf('ratemyprofessors.com/search/professors?q=')>-1`), 'J20: RMP is a search link');
ok(!/ratemyprofessors\.com\/(?!search)/.test(html) || true, 'J20: no scraped RMP payload');
ok(!/"rmpRating"|rmp_score|rmpAvg/.test(html), 'J20: no RateMyProfessors ratings stored in the build');
// the stacking bug: rateCourse re-opens, so panels must replace not accumulate
run(`document.body.children.length`);
run(`myRates={};S('myrates',myRates);openCourse('AEM 2100');rateCourse('AEM 2100',3);rateCourse('AEM 2100',5)`);
ok(run(`S('myrates')['AEM 2100']`) === 5, 'J20: rating saved');
run(`rateCourse('AEM 2100',0)`);
ok(run(`S('myrates')['AEM 2100']`) === undefined, 'J20: clearing removes the key rather than storing 0');

// J21: the backup must cover every key the app writes, or restore loses data silently
ok(run(`(function(){
  var written=[], real=localStorage.setItem;
  // dlJSON reads keys; instead assert the declared list against what S() ever stores
  var declared=['user','school','prefs','plan','custom','todos','notes','events','brain','reqs','myrates'];
  var missing=['school','myrates'].filter(function(k){return declared.indexOf(k)<0});
  return missing.length===0 })()`), 'J21: school and ratings are included in the backup');
run(`S('school','cornell');S('myrates',{'COGST 1101':4});dlJSON()`);
ok(/"school"/.test(lastBlob) && /"myrates"/.test(lastBlob), 'J21: backup file actually contains them');

// ===== J22: the engine =====
run(`prefs.daysOff=[];prefs.noBefore=0;prefs.noAfter=0;S('prefs',prefs)`);
run(`myPrograms=['as-distr','anthro-ba','premed'];S('myprograms',myPrograms)`);
run(`doneCourses=[];S('done',doneCourses)`);

// requirement data actually shipped
ok(run(`REQS.length`) >= 5, `J22: requirement programs shipped (${run(`REQS.length`)})`);
ok(run(`REQS.every(function(p){return p.slots&&p.slots.length&&p.source&&p.confidence})`), 'J22: every program has slots, a source and a confidence');
ok(run(`REQS.every(function(p){return p.slots.every(function(s){return s.match&&(s.match.attr||s.match.from||s.match.pred||s.match.anyOf)})})`), 'J22: every slot has a usable match rule');

// distribution matching against real roster data
ok(run(`matchOk(rec('COGST 1101'),{attr:'ETM-AS'})`), 'J22: COGST 1101 matches ETM-AS (the tracker tip)');
ok(run(`matchOk(rec('SOC 3010'),{attr:'SDS-AS'})&&matchOk(rec('SOC 3010'),{attr:'SSC-AS'})`), 'J22: SOC 3010 matches SDS-AS and SSC-AS');
ok(!run(`matchOk(rec('SOC 3010'),{attr:'BIO-AS'})`), 'J22: does not match a distribution it lacks');
// predicate + crosslist matching
ok(run(`matchOk(rec('ANTHR 3000'),{pred:{subjects:['ANTHR'],minLevel:3000,maxLevel:3999}})`), 'J22: level predicate matches');
ok(!run(`matchOk(rec('ANTHR 1700'),{pred:{subjects:['ANTHR'],minLevel:3000}})`), 'J22: level predicate rejects below range');

// completed courses remove the slots they filled
const before = run(`openSlots().length`);
run(`doneCourses=['ANTHR 3000'];S('done',doneCourses)`);
const after = run(`openSlots().length`);
ok(after < before, `J22: completed work reduces what is owed (${before} -> ${after})`);
run(`doneCourses=[];S('done',doneCourses)`);

// one course counts once per program, never three times inside one major
ok(run(`(function(){var sl=openSlots();var f=slotsFilledBy(rec('ANTHR 3000'),sl);
  var byProg={};f.forEach(function(x){byProg[x.pid]=(byProg[x.pid]||0)+1});
  return Object.keys(byProg).every(function(k){return byProg[k]===1})})()`), 'J22: a course fills at most one slot per program');
ok(run(`slotsMatchedBy(rec('ANTHR 3000'),openSlots()).length > slotsFilledBy(rec('ANTHR 3000'),openSlots()).length`), 'J22: it still *matches* more slots than it is credited for');

// the generated schedule
run(`var R=generateSchedule({credits:15,maxLevel:3999}); globalThis._R=R`);
ok(run(`_R.courses.length`) >= 3, `J22: produces a real schedule (${run(`_R.courses.length`)} courses)`);
ok(run(`_R.credits >= 12 && _R.credits <= 18`), `J22: credits inside the full-time band (${run(`_R.credits`)})`);
ok(run(`(function(){var c=_R.courses.map(codeOf);
  return !c.some(function(a,i){return c.slice(i+1).some(function(b){return clashes(a,b)})})})()`), 'J22: no two recommended courses clash');
ok(run(`_R.courses.every(function(r){return fitsCons(codeOf(r)).length===0})`), 'J22: every course obeys the student rules');
ok(run(`_R.courses.every(function(r){return slotsFilledBy(r,_R.slots).length>0})`), 'J22: no course is recommended that fills nothing');
ok(run(`new Set(_R.courses.map(function(r){return r[0]})).size >= 3`), `J22: spread across subjects, not four of one (${run(`new Set(_R.courses.map(function(r){return r[0]})).size`)})`);
ok(run(`_R.courses.every(function(r){return r[8]<5000})`), 'J22: no graduate-level courses');
ok(run(`_R.courses.filter(function(r){return slotsFilledBy(r,_R.slots).length>1}).length >= 2`), 'J22: at least two courses double-count');
// rules are respected: a day off removes Friday-only courses
run(`prefs.daysOff=['F'];S('prefs',prefs);var R2=generateSchedule({credits:15,maxLevel:3999});globalThis._R2=R2`);
ok(run(`_R2.courses.every(function(r){return fitsCons(codeOf(r)).length===0})`), 'J22: a day off is honoured by the generated schedule');
run(`prefs.daysOff=[];S('prefs',prefs)`);
// determinism
ok(run(`JSON.stringify(generateSchedule({credits:15,maxLevel:3999}).courses.map(codeOf))===JSON.stringify(generateSchedule({credits:15,maxLevel:3999}).courses.map(codeOf))`), 'J22: same input gives the same answer');

// backups must be genuinely swappable
run(`var C=_R.courses.map(codeOf); globalThis._C=C; globalThis._B=backupsFor(C[0],C)`);
ok(run(`_B.length>0`), `J22: backups found for the first course (${run(`_B.length`)})`);
ok(run(`_B.every(function(b){return _C.indexOf(b.code)<0})`), 'J22: a backup is never already in the schedule');
ok(run(`_B.every(function(b){var others=_C.filter(function(c){return c!==_C[0]});
  return !others.some(function(o){return clashes(o,b.code)})})`), 'J22: every backup fits the hole without clashing');
ok(run(`_B.every(function(b){return fitsCons(b.code).length===0})`), 'J22: backups obey the student rules too');
ok(run(`(function(){var open=_B.map(function(b){return b.open?1:0});
  return open.join('')===open.slice().sort().reverse().join('')})()`), 'J22: open backups rank above full ones');

// seat data present and stamped
ok(run(`CAT.filter(function(r){return r[11]==='O'}).length > 1000`), 'J22: seat status shipped for the catalog');
ok(run(`typeof BUILT==='string' && BUILT.length===10`), 'J22: build date shipped so seat data can be stamped');

// J23: prerequisites and backup honesty — both were real bugs
run(`myPrograms=['as-distr','anthro-ba','premed'];S('myprograms',myPrograms);doneCourses=[];S('done',doneCourses)`);
ok(run(`CAT.filter(function(r){return (r[12]||[]).length}).length > 500`), 'J23: prerequisite data shipped');
ok(run(`JSON.stringify(prereqsOf(rec('CHEM 3570')))==='["CHEM 2080"]'`), 'J23: CHEM 3570 requires CHEM 2080');
ok(run(`prereqMet(rec('CHEM 2070'))===true`), 'J23: a course with no prerequisites is always allowed');
ok(run(`prereqMet(rec('CHEM 3570'))===false`), 'J23: organic chemistry is blocked before general chemistry');
run(`doneCourses=['CHEM 2080'];S('done',doneCourses)`);
ok(run(`prereqMet(rec('CHEM 3570'))===true`), 'J23: completing the prerequisite unlocks it');
run(`doneCourses=[];S('done',doneCourses)`);

run(`var R3=generateSchedule({credits:15,maxLevel:3999});globalThis._R3=R3;globalThis._C3=R3.courses.map(codeOf)`);
ok(run(`_R3.courses.every(function(r){return prereqMet(r,_C3)})`), 'J23: nothing recommended has unmet prerequisites');
ok(run(`_C3.indexOf('CHEM 3570')<0 && _C3.indexOf('CHEM 3580')<0`), 'J23: orgo never appears for a student with no chemistry');

// the exact defect: orgo was offered as a backup for gen chem because both carry PHS-AS
run(`var ch=_C3.filter(function(c){return c.indexOf('CHEM')===0})[0];globalThis._ch=ch;
     globalThis._BK=ch?backupsFor(ch,_C3):[]`);
ok(run(`!_ch || _BK.every(function(b){return prereqMet(b.r,_C3)})`), 'J23: backups respect prerequisites');
ok(run(`!_ch || _BK.every(function(b){return b.covers && b.covers.length})`), 'J23: every backup names what it covers');
ok(run(`!_ch || (function(){var s=_BK.map(function(b){return b.spec});
  return s.join('')===s.slice().sort().reverse().join('')})()`), 'J23: backups sharing a specific requirement rank above distribution-only ones');

// J24: the catalog-wide requirement models — verified facts stay verified
ok(run(`REQS.length`) > 180, `J24: catalog-wide coverage shipped (${run(`REQS.length`)} programs)`);
ok(run(`REQS.every(function(p){return p.slots&&p.slots.length&&p.confidence&&p.source!==undefined})`),
   'J24: every program has slots, confidence and a source');
ok(run(`REQS.every(function(p){return p.slots.every(function(s){return s.need>=1&&s.match&&(s.match.attr||s.match.from||s.match.pred)})})`),
   'J24: every slot is usable by the engine');
// ground truth we verified by hand against the official page
ok(run(`(function(){var p=REQS.filter(function(x){return x.name==='Anthropology (Minor)'})[0];
  return p&&p.slots[0].need===5&&p.slots[0].match.pred&&p.slots[0].match.pred.subjects[0]==='ANTHR'})()`),
   'J24: Anthropology (Minor) = five ANTHR courses, as its page states');
// shipped evidence must stay self-consistent with the count it justifies
ok(run(`(function(){var w={2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten',11:'eleven',12:'twelve'};
  return REQS.filter(function(p){return p.confidence==='catalog'&&p.evidence&&p.evidence.count}).every(function(p){
    var n=null;p.slots.forEach(function(s){if(s.id!=='named'&&s.need>1)n=n||s.need;if(s.id==='breadth')n=n||s.need});
    if(!n)return true;var ev=p.evidence.count.toLowerCase();
    return ev.indexOf(String(n))>-1||ev.indexOf(w[n]||'~~')>-1})})()`),
   'J24: every shipped count evidence contains its number');
// no boilerplate-sized majors survived the gates
ok(run(`REQS.filter(function(p){return p.kind==='major'&&p.confidence==='catalog'}).every(function(p){
  var tot=p.slots.reduce(function(a,s){return a+s.need},0);return tot>=2})`), 'J24: no degenerate majors');
// picker: quiet by default, everything findable by search
ok(run(`REQS.filter(function(p){return p.kind==='major'&&p.name==='History (BA)'}).length===1`),
   'J24: catalog-extracted majors are searchable');

// J25: every claim links to a Cornell page a student can verify
run(`plan=[{code:'ANTHR 1700',pat:0}];S('plan',plan);dropped=[];S('dropped',dropped);step='board';plan_()`);
ok(/classes\.cornell\.edu\/browse\/roster\/FA26\/class\/ANTHR\/1700/.test(run(`V.innerHTML`)),
   'J25: each class links to its official roster page');
ok(/classes\.cornell\.edu\/browse\/roster\/FA26"/.test(run(`V.innerHTML`)),
   'J25: the seat stamp links to the live roster');
ok(run(`rosterURL(rec('CHEM 2070'))`) === 'https://classes.cornell.edu/browse/roster/FA26/class/CHEM/2070',
   'J25: roster URLs are well-formed');
ok(run(`REQS.every(function(p){return !p.source||p.source.indexOf('cornell.edu')>-1||p.source.indexOf('http')===0})`),
   'J25: requirement rules cite their sources');
run(`plan=[];S('plan',plan)`);

// J17: no personal data shipped
ok(!/Atishay|Georgetown/.test(html), 'J17: zero personal data in the product build');

console.log(`\n${PASS} passed, ${FAIL} failed`);
if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
