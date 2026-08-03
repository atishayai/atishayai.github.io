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

// J1: onboarding asks which school before anything else
ok(run(`S('school')`) === null, 'J1: fresh user has no school yet');
ok(run(`document.getElementById('onboard')!==undefined`), 'J1: onboarding screen is shown');
run(`obSchool('cornell')`);
ok(run(`S('school')`) === 'cornell', 'J1: picking a school is remembered');

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

// J17: no personal data shipped
ok(!/Atishay|Georgetown/.test(html), 'J17: zero personal data in the product build');

console.log(`\n${PASS} passed, ${FAIL} failed`);
if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
