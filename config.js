// ============================================================
//  UrbanFlow — config.js (Enhanced)
// ============================================================

const URBANFLOW_CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyA-nKY07MBiOCAvUFQSEgiH_eF3MTKpDWg",
    authDomain: "solapur-road-monitoring.firebaseapp.com",
    projectId: "solapur-road-monitoring",
    storageBucket: "solapur-road-monitoring.firebasestorage.app",
    messagingSenderId: "94080701473",
    appId: "1:94080701473:web:fed4efa67d23d5e4177f60"
  },
  aiEndpoint:  'http://localhost:8000/detect',
  forceMock:   false,
  appName:     'UrbanFlow Monitor',
  version:     '4.1.0',
  mapTiles:    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttrib:   '© OpenStreetMap contributors',
  defaultLat:  28.6139,
  defaultLng:  77.2090,
  defaultZoom: 13,
  // Smart assignment: auto-assign to worker within this radius (km) of a recent completed job
  smartAssignRadius: 0.6,
};

URBANFLOW_CONFIG.isMock =
  URBANFLOW_CONFIG.forceMock ||
  !URBANFLOW_CONFIG.firebaseConfig.apiKey;

// ─── DEMO USERS ───────────────────────────────────────────────
const MOCK_USERS = {
  citizen: { id:'c-001', name:'Rahul Sharma',    email:'rahul@demo.com',  role:'citizen', avatar:'RS', phone:'+91 98100 00001' },
  citizen2:{ id:'c-002', name:'Priya Verma',     email:'priya@demo.com',  role:'citizen', avatar:'PV', phone:'+91 98100 00002' },
  citizen3:{ id:'c-003', name:'Amit Kumar',      email:'amit@demo.com',   role:'citizen', avatar:'AK', phone:'+91 98100 00003' },
  worker:  { id:'w-001', name:'Arjun Singh',     email:'arjun@demo.com',  role:'worker',  avatar:'AS', phone:'+91 98100 10001', zone:'Zone 1 (North)' },
  worker2: { id:'w-002', name:'Deepak Kumar',    email:'deepak@demo.com', role:'worker',  avatar:'DK', phone:'+91 98100 10002', zone:'Zone 2 (South)' },
  worker3: { id:'w-003', name:'Sunita Devi',     email:'sunita@demo.com', role:'worker',  avatar:'SD', phone:'+91 98100 10003', zone:'Zone 3 (East)' },
  admin:   { id:'a-001', name:'Priya Mehta',     email:'admin@demo.com',  role:'admin',   avatar:'PM' },
};

// Demo account lists for the login pickers
const CITIZEN_DEMO_ACCOUNTS = [
  { ...MOCK_USERS.citizen,  desc:'3 reports submitted' },
  { ...MOCK_USERS.citizen2, desc:'1 report submitted' },
  { ...MOCK_USERS.citizen3, desc:'2 reports submitted' },
];
const WORKER_DEMO_ACCOUNTS = [
  { ...MOCK_USERS.worker,  desc:'2 active tasks • Zone 1', tasks:2 },
  { ...MOCK_USERS.worker2, desc:'1 active task • Zone 2',  tasks:1 },
  { ...MOCK_USERS.worker3, desc:'0 active tasks • Zone 3', tasks:0 },
];

// ─── MOCK REPORTS ─────────────────────────────────────────────
const MOCK_REPORTS = [
  {
    id:'r-001', user_id:'c-001',
    category:'pothole', status:'assigned',
    latitude:28.6150, longitude:77.2100,
    image_url:'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=400&h=300&fit=crop',
    ai_result:{ label:'pothole', confidence:0.92 },
    assigned_worker_id:'w-001',
    instructions:'Large pothole causing accidents. Blocks left lane completely.',
    severity:'high',
    created_at:'2026-04-08T07:00:00Z',
    address:'Connaught Place, New Delhi',
    work_started_at: null, work_started_photo: null,
    work_completed_at: null, work_completed_photo: null,
  },
  {
    id:'r-002', user_id:'c-001',
    category:'crack', status:'submitted',
    latitude:28.6200, longitude:77.2200,
    image_url:'https://images.unsplash.com/photo-1605106702734-205df224ecce?w=400&h=300&fit=crop',
    ai_result:{ label:'crack', confidence:0.85 },
    assigned_worker_id:null,
    instructions:'Long diagonal crack across the road. Widening every day.',
    severity:'medium',
    created_at:'2026-04-08T09:30:00Z',
    address:'Karol Bagh, New Delhi',
    work_started_at: null, work_started_photo: null,
    work_completed_at: null, work_completed_photo: null,
  },
  {
    id:'r-003', user_id:'c-002',
    category:'water_logging', status:'completed',
    latitude:28.6155, longitude:77.2105,   // Very close to r-001 for smart assignment demo
    image_url:'https://images.unsplash.com/photo-1583354154763-8a7a2a6e6929?w=400&h=300&fit=crop',
    ai_result:{ label:'water_logging', confidence:0.78 },
    assigned_worker_id:'w-001',
    instructions:'Water not draining after rain. People unable to cross.',
    severity:'high',
    created_at:'2026-04-07T14:00:00Z',
    address:'Connaught Place Inner Circle, New Delhi',
    work_started_at:'2026-04-07T15:00:00Z',
    work_started_photo:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
    work_completed_at:'2026-04-07T17:30:00Z',
    work_completed_photo:'https://images.unsplash.com/photo-1583354154763-8a7a2a6e6929?w=200&h=200&fit=crop',
  },
  {
    id:'r-004', user_id:'c-003',
    category:'garbage', status:'submitted',
    latitude:28.6300, longitude:77.2300,
    image_url:'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=400&h=300&fit=crop',
    ai_result:{ label:'garbage', confidence:0.88 },
    assigned_worker_id:null,
    instructions:'Garbage pile blocking footpath and road shoulder.',
    severity:'medium',
    created_at:'2026-04-08T11:00:00Z',
    address:'Rohini, New Delhi',
    work_started_at: null, work_started_photo: null,
    work_completed_at: null, work_completed_photo: null,
  },
  {
    id:'r-005', user_id:'c-001',
    category:'pothole', status:'assigned',
    latitude:28.6100, longitude:77.2150,
    image_url:'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=400&h=300&fit=crop',
    ai_result:{ label:'pothole', confidence:0.95 },
    assigned_worker_id:'w-002',
    instructions:'Pothole near school zone. Children at risk.',
    severity:'high',
    created_at:'2026-04-08T13:00:00Z',
    address:'Nehru Place, New Delhi',
    work_started_at:'2026-04-08T14:00:00Z',
    work_started_photo:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
    work_completed_at: null, work_completed_photo: null,
  },
  {
    id:'r-006', user_id:'c-002',
    category:'crack', status:'completed',
    latitude:28.6250, longitude:77.1950,
    image_url:'https://images.unsplash.com/photo-1605106702734-205df224ecce?w=400&h=300&fit=crop',
    ai_result:{ label:'crack', confidence:0.80 },
    assigned_worker_id:'w-002',
    instructions:'',
    severity:'low',
    created_at:'2026-04-07T16:00:00Z',
    address:'Dwarka, New Delhi',
    work_started_at:'2026-04-07T17:00:00Z',
    work_started_photo:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
    work_completed_at:'2026-04-07T18:30:00Z',
    work_completed_photo:'https://images.unsplash.com/photo-1605106702734-205df224ecce?w=200&h=200&fit=crop',
  },
];

// ─── MOCK WORKERS (performance data) ──────────────────────────
const MOCK_WORKERS = [
  { id:'w-001', name:'Arjun Singh',  email:'arjun@demo.com',  credibility_score:95, tasks_completed:42, active_tasks:2, zone:'Zone 1 (North)' },
  { id:'w-002', name:'Deepak Kumar', email:'deepak@demo.com', credibility_score:88, tasks_completed:31, active_tasks:1, zone:'Zone 2 (South)' },
  { id:'w-003', name:'Sunita Devi',  email:'sunita@demo.com', credibility_score:92, tasks_completed:58, active_tasks:0, zone:'Zone 3 (East)' },
];

// ─── MOCK ATTENDANCE ──────────────────────────────────────────
const MOCK_ATTENDANCE = [
  { id:'a-001', worker_id:'w-001', report_id:'r-001',
    before_image: null, after_image: null,
    login_time: null, logout_time: null },
];
