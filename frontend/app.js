window.addEventListener('scroll',()=>document.getElementById('nav').classList.toggle('on',scrollY>60));
function toggleMenu(){document.getElementById('mm').classList.toggle('open')}

/* Universal scroll-reveal: auto-targets ALL revealable elements */
const REVEAL_SEL = '.rv,.ev-card,.com-card,.tm-card,.lead-card,.cdb,.ft-loc-box,.ft-soc,.tl2-card';
function chk(){
  const t = innerHeight * .88;
  document.querySelectorAll(REVEAL_SEL).forEach(el=>{
    if(el.getBoundingClientRect().top < t) el.classList.add('in');
  });
}
addEventListener('scroll', chk, {passive:true});
chk(); /* run on load for above-fold items */

const ti=document.querySelectorAll('.ti');
let ix=0;
if (ti.length) {
  setInterval(()=>{ti[ix].classList.remove('on');ix=(ix+1)%ti.length;ti[ix].classList.add('on')},3500);
}

const end=new Date('2026-04-16T18:00:00').getTime();
function upd(){
  const g=end-Date.now();
  if(g<=0)return;
  const d=Math.floor(g/864e5),h=Math.floor(g%864e5/36e5),m=Math.floor(g%36e5/6e4),s=Math.floor(g%6e4/1e3);
  ['d','h','m','s'].forEach((k,i)=>document.getElementById('cd-'+k).textContent=String([d,h,m,s][i]).padStart(2,'0'));
}
upd();
setInterval(upd,1000);

// Lenis smooth scroll
if (typeof Lenis !== 'undefined') {
  const lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))});
  function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);
}

// Mouse tracking spotlight
const cg = document.getElementById('cglow');
if (cg) {
  addEventListener('mousemove', (e) => { cg.style.transform = `translate(${e.clientX - 350}px, ${e.clientY - 350}px)`});
}

// Vanilla Tilt 3D Physics (applied to all card types)
if (typeof VanillaTilt !== 'undefined') {
  VanillaTilt.init(document.querySelectorAll('.ev-card, .com-card, .tm-card, .tl2-card, .lead-card, .poster-container'), { max: 7, speed: 400, glare: true, 'max-glare': 0.12, scale: 1.01 });
}

// Registration form submit to backend DB API
const regForm = document.getElementById('reg-form');
const regStatus = document.getElementById('reg-status');
const regSubmit = document.getElementById('reg-submit');
const iplSlotCard = document.getElementById('ipl-slot-card');
const iplSlotForm = document.getElementById('ipl-slot-form');
const iplFormOption = document.getElementById('ipl-form-option');
const technicalTeamDetails = document.getElementById('technical-team-details');
const nonTechnicalTeamDetails = document.getElementById('nontechnical-team-details');

const TEAM_RULES = {
  Innopitch: { min: 3, max: 3 },
  'E-Sports (Free fire)': { min: 4, max: 4 },
  'IPL Auction': { min: 3, max: 3 },
  'Channel Surfing': { min: 3, max: 3 },
  'Visual Connect': { min: 1, max: 3 },
  Devfolio: { min: 1, max: 1 },
  Promptcraft: { min: 1, max: 1 }
};

const IPL_TOTAL_SLOTS = 10;
let iplRegisteredTeams = 0;

const APP_CONFIG = window.__PIXELORA_CONFIG__ || {};
const API_BASE_URL = String(APP_CONFIG.apiBaseUrl || '').trim().replace(/\/+$/, '');

function buildApiUrl(path) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

// Replace placeholder values with your Firebase project config before deployment.
const FIREBASE_CONFIG = {
  apiKey: APP_CONFIG.firebase?.apiKey || 'REPLACE_WITH_API_KEY',
  authDomain: APP_CONFIG.firebase?.authDomain || 'REPLACE_WITH_AUTH_DOMAIN',
  projectId: APP_CONFIG.firebase?.projectId || 'REPLACE_WITH_PROJECT_ID',
  storageBucket: APP_CONFIG.firebase?.storageBucket || 'REPLACE_WITH_STORAGE_BUCKET',
  messagingSenderId: APP_CONFIG.firebase?.messagingSenderId || 'REPLACE_WITH_MESSAGING_SENDER_ID',
  appId: APP_CONFIG.firebase?.appId || 'REPLACE_WITH_APP_ID'
};

function hasFirebaseConfig(config) {
  return Object.values(config).every((value) => value && !String(value).startsWith('REPLACE_WITH_'));
}

let firebaseDb = null;
if (typeof firebase !== 'undefined' && hasFirebaseConfig(FIREBASE_CONFIG)) {
  const app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
  firebaseDb = app.firestore();
}

function getIplSlotsLeft() {
  return Math.max(0, IPL_TOTAL_SLOTS - iplRegisteredTeams);
}

function updateIplSlotUI() {
  const left = getIplSlotsLeft();

  if (iplSlotCard) {
    iplSlotCard.textContent = left > 0 ? `Slots Left: ${left}` : 'Slots Left: 0 (Full)';
    iplSlotCard.classList.toggle('full', left <= 0);
  }

  if (iplSlotForm) {
    iplSlotForm.textContent = left > 0 ? `(${left} slots left)` : '(Full)';
  }

  if (iplFormOption) {
    if (left <= 0) {
      const selected = iplFormOption.querySelector('input[type="radio"]');
      if (selected) selected.checked = false;
      iplFormOption.style.display = 'none';
    } else {
      iplFormOption.style.display = 'flex';
    }
  }
}

function watchIplSlots() {
  if (!firebaseDb) {
    updateIplSlotUI();
    return;
  }

  firebaseDb.collection('slotCounters').doc('iplAuction').onSnapshot(
    (snapshot) => {
      const registered = Number(snapshot.data()?.registered || 0);
      iplRegisteredTeams = Math.min(IPL_TOTAL_SLOTS, Math.max(0, registered));
      updateIplSlotUI();
    },
    () => {
      updateIplSlotUI();
    }
  );
}

async function reserveIplSlot() {
  if (!firebaseDb) return false;

  const slotRef = firebaseDb.collection('slotCounters').doc('iplAuction');
  await firebaseDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(slotRef);
    const current = Number(snapshot.data()?.registered || 0);
    if (current >= IPL_TOTAL_SLOTS) {
      throw new Error('IPL Auction slots are full. Please select another non-technical event.');
    }

    transaction.set(
      slotRef,
      {
        registered: current + 1,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });

  return true;
}

async function releaseIplSlot() {
  if (!firebaseDb) return;

  const slotRef = firebaseDb.collection('slotCounters').doc('iplAuction');
  await firebaseDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(slotRef);
    const current = Number(snapshot.data()?.registered || 0);
    transaction.set(
      slotRef,
      {
        registered: Math.max(0, current - 1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}

async function saveRegistrationToFirebase(registrationData) {
  if (!firebaseDb) return;
  await firebaseDb.collection('registrations').add({
    ...registrationData,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

watchIplSlots();

if (regForm) {
  regForm.querySelectorAll('input[name="technicalEvents"]').forEach((input) => {
    input.addEventListener('change', () => updateTeamDetails('technical'));
  });

  regForm.querySelectorAll('input[name="nonTechnicalEvents"]').forEach((input) => {
    input.addEventListener('change', () => updateTeamDetails('nontechnical'));
  });

  if (technicalTeamDetails) {
    technicalTeamDetails.addEventListener('change', (event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.name === 'technicalTeamSize') {
        updateTeamDetails('technical');
      }
    });
  }

  if (nonTechnicalTeamDetails) {
    nonTechnicalTeamDetails.addEventListener('change', (event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.name === 'nontechnicalTeamSize') {
        updateTeamDetails('nontechnical');
      }
    });
  }

  refreshTeamDetails();
}

function setRegStatus(message, type) {
  if (!regStatus) return;
  regStatus.textContent = message;
  regStatus.classList.remove('ok', 'err');
  if (type) regStatus.classList.add(type);
}

function getTeamRule(eventName) {
  return TEAM_RULES[eventName] || { min: 1, max: 1 };
}

function createTeamDetailsMarkup(groupName, selectedEvent, selectedSize) {
  if (!selectedEvent) return '';

  const safeGroup = groupName === 'technical' ? 'technical' : 'nontechnical';
  const rule = getTeamRule(selectedEvent);
  const teamSize = Math.min(rule.max, Math.max(rule.min, Number(selectedSize) || rule.min));
  const memberCount = Math.max(0, teamSize - 1);
  const sizeHint = rule.min === rule.max ? `Team size: ${rule.max}` : `Team size: ${rule.min} to ${rule.max}`;

  let memberRows = '';
  for (let idx = 1; idx <= memberCount; idx += 1) {
    memberRows += `
      <label class="reg-field">
        <span>Team Member ${idx} Name</span>
        <input type="text" name="${safeGroup}TeamMember${idx}" required>
      </label>
    `;
  }

  return `
    <div class="team-head">
      <span class="team-title">${selectedEvent} Team Details</span>
      <span class="team-hint">${sizeHint}</span>
    </div>
    <label class="reg-field">
      <span>Team Name</span>
      <input type="text" name="${safeGroup}TeamName" required>
    </label>
    <label class="reg-field">
      <span>Team Leader Name</span>
      <input type="text" name="${safeGroup}TeamLeader" required>
    </label>
    ${
      rule.min !== rule.max
        ? `<label class="reg-field">
            <span>Team Size</span>
            <select name="${safeGroup}TeamSize" required>
              ${Array.from({ length: rule.max - rule.min + 1 }, (_, i) => {
                const size = rule.min + i;
                const selected = size === teamSize ? 'selected' : '';
                return `<option value="${size}" ${selected}>${size} members</option>`;
              }).join('')}
            </select>
          </label>`
        : `<input type="hidden" name="${safeGroup}TeamSize" value="${teamSize}">`
    }
    <div class="team-members team-member-row">
      ${memberRows}
    </div>
  `;
}

function updateTeamDetails(groupName) {
  if (!regForm) return;

  const isTechnical = groupName === 'technical';
  const container = isTechnical ? technicalTeamDetails : nonTechnicalTeamDetails;
  if (!container) return;

  const eventField = isTechnical ? 'technicalEvents' : 'nonTechnicalEvents';
  const selectedEvent = regForm.querySelector(`input[name="${eventField}"]:checked`)?.value || '';
  const selectedSize = container.querySelector(`select[name="${groupName}TeamSize"]`)?.value;

  if (!selectedEvent) {
    container.classList.add('empty');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('empty');
  container.innerHTML = createTeamDetailsMarkup(groupName, selectedEvent, selectedSize);
}

function refreshTeamDetails() {
  updateTeamDetails('technical');
  updateTeamDetails('nontechnical');
}

window.refreshTeamDetails = refreshTeamDetails;

function collectTeamDetails(groupName, formData) {
  const eventField = groupName === 'technical' ? 'technicalEvents' : 'nonTechnicalEvents';
  const label = groupName === 'technical' ? 'technical' : 'non-technical';
  const selectedEvent = String(formData.get(eventField) || '').trim();

  if (!selectedEvent) {
    return { ok: false, error: `Please select one ${label} event.` };
  }

  const rule = getTeamRule(selectedEvent);
  const teamName = String(formData.get(`${groupName}TeamName`) || '').trim();
  const teamLeader = String(formData.get(`${groupName}TeamLeader`) || '').trim();
  const teamSize = Math.min(rule.max, Math.max(rule.min, Number(formData.get(`${groupName}TeamSize`) || rule.min)));

  if (!teamName || !teamLeader) {
    return { ok: false, error: `Please fill ${label} team name and leader details.` };
  }

  const members = [];
  for (let idx = 1; idx <= Math.max(0, teamSize - 1); idx += 1) {
    const memberName = String(formData.get(`${groupName}TeamMember${idx}`) || '').trim();
    if (!memberName) {
      return { ok: false, error: `Please fill ${label} team member ${idx} name.` };
    }
    members.push(memberName);
  }

  return {
    ok: true,
    data: {
      event: selectedEvent,
      teamName,
      teamLeader,
      teamSize,
      members
    }
  };
}

if (regForm && regSubmit) {
  regForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (window.location.protocol === 'file:') {
      setRegStatus('Please run through backend server to submit the form.', 'err');
      return;
    }

    const formData = new FormData(regForm);
    const paymentScreenshot = formData.get('paymentScreenshot');

    const required = {
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      whatsapp: String(formData.get('whatsapp') || '').trim(),
      year: String(formData.get('year') || '').trim(),
      collegeName: String(formData.get('collegeName') || '').trim(),
      departmentName: String(formData.get('departmentName') || '').trim(),
      food: String(formData.get('food') || '').trim()
    };

    if (Object.values(required).some((value) => !value)) {
      setRegStatus('Please fill all required fields.', 'err');
      return;
    }

    const technicalEvents = String(formData.get('technicalEvents') || '').trim();
    const nonTechnicalEvents = String(formData.get('nonTechnicalEvents') || '').trim();

    if (!technicalEvents) {
      setRegStatus('Please select one technical event.', 'err');
      return;
    }

    if (!nonTechnicalEvents) {
      setRegStatus('Please select one non-technical event.', 'err');
      return;
    }

    const selectedIplAuction = nonTechnicalEvents === 'IPL Auction';
    if (selectedIplAuction && getIplSlotsLeft() <= 0) {
      setRegStatus('IPL Auction slots are full. Please choose another non-technical event.', 'err');
      updateIplSlotUI();
      return;
    }

    const technicalTeam = collectTeamDetails('technical', formData);
    if (!technicalTeam.ok) {
      setRegStatus(technicalTeam.error, 'err');
      return;
    }

    const nonTechnicalTeam = collectTeamDetails('nontechnical', formData);
    if (!nonTechnicalTeam.ok) {
      setRegStatus(nonTechnicalTeam.error, 'err');
      return;
    }

    formData.set('technicalTeamName', technicalTeam.data.teamName);
    formData.set('technicalTeamLeader', technicalTeam.data.teamLeader);
    formData.set('technicalTeamSize', String(technicalTeam.data.teamSize));
    formData.set('technicalTeamMembers', JSON.stringify(technicalTeam.data.members));

    formData.set('nonTechnicalTeamName', nonTechnicalTeam.data.teamName);
    formData.set('nonTechnicalTeamLeader', nonTechnicalTeam.data.teamLeader);
    formData.set('nonTechnicalTeamSize', String(nonTechnicalTeam.data.teamSize));
    formData.set('nonTechnicalTeamMembers', JSON.stringify(nonTechnicalTeam.data.members));

    if (!(paymentScreenshot instanceof File) || !paymentScreenshot.name) {
      setRegStatus('Please upload your payment screenshot.', 'err');
      return;
    }

    regSubmit.disabled = true;
    regSubmit.textContent = 'Submitting...';
    setRegStatus('Submitting your registration...', null);

    let slotReserved = false;

    try {
      if (selectedIplAuction) {
        slotReserved = await reserveIplSlot();
      }

      const response = await fetch(buildApiUrl('/api/registrations'), {
        method: 'POST',
        body: formData
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Submission failed.');
      }

      await saveRegistrationToFirebase({
        ...required,
        technicalEvents,
        nonTechnicalEvents,
        technicalTeam: technicalTeam.data,
        nonTechnicalTeam: nonTechnicalTeam.data
      });

      regForm.reset();
      refreshTeamDetails();
      setRegStatus('Registered successfully. See you at PIXELORA 2K26!', 'ok');
    } catch (error) {
      if (slotReserved) {
        try {
          await releaseIplSlot();
        } catch (_releaseError) {
          // If rollback fails, live counter listener will still correct on next successful write.
        }
      }
      setRegStatus(error.message || 'Unable to submit right now. Try again later.', 'err');
    } finally {
      regSubmit.disabled = false;
      regSubmit.textContent = 'Submit Registration';
    }
  });
}
