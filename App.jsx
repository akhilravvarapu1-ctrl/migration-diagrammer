import React, { useState, useEffect, useCallback, useReducer } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Server, Database, Cloud, Network, Zap, CornerRightUp, RefreshCw, X, Check, Loader2, User, GitPullRequest } from 'lucide-react';
// --- FIREBASE GLOBAL VARIABLES INITIALIZATION ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
// AWS Service Icon Map
const SERVICE_ICONS = {
 Server: { icon: Server, color: 'bg-red-500' },
 Database: { icon: Database, color: 'bg-indigo-500' },
 Network: { icon: Network, color: 'bg-blue-500' },
 Cloud: { icon: Cloud, color: 'bg-green-500' },
};
// Initial state for the diagram
const initialDiagramState = {
 nodes: [],
 selectedTool: null,
 migrationStatus: null,
};
// Reducer for complex state updates
const diagramReducer = (state, action) => {
 switch (action.type) {
   case 'SET_NODES':
     return { ...state, nodes: action.payload };
   case 'SELECT_TOOL':
     return { ...state, selectedTool: action.payload };
   case 'SET_STATUS':
     return { ...state, migrationStatus: action.payload };
   case 'UPDATE_NODE':
     return {
       ...state,
       nodes: state.nodes.map(node =>
node.id === action.payload.id ? { ...node, ...action.payload.updates } : node
       ),
     };
   case 'INITIATE_MIGRATION':
     return {
       ...state,
       nodes: state.nodes.map(node =>
node.id === action.payload.id ? { ...node, status: 'MIGRATING', panel: 'Target' } : node
       ),
       migrationStatus: { id: action.payload.id, name: action.payload.name, status: 'Starting' }
     };
   default:
     return state;
 }
};
// --------------------------------------------------------------------------------
// ---------------------------- CORE COMPONENTS -----------------------------------
// --------------------------------------------------------------------------------
// A utility function to generate a unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);
/**
* Node component: Represents an individual AWS service icon on the canvas.
*/
const Node = ({ node, dispatch }) => {
 const Icon = SERVICE_ICONS[node.type].icon;
 const bgColor = SERVICE_ICONS[node.type].color;
 const handleDragStart = (e) => {
   e.dataTransfer.setData('nodeId', node.id);
   e.dataTransfer.setData('isExisting', 'true');
 };
 const statusMap = {
   IDLE: { color: 'text-gray-400', icon: CornerRightUp },
   MIGRATING: { color: 'text-yellow-500 animate-spin', icon: Loader2 },
   SUCCESS: { color: 'text-green-500', icon: Check },
   FAILED: { color: 'text-red-500', icon: X },
 };
 const { color, icon: StatusIcon } = statusMap[node.status] || statusMap.IDLE;
 return (
<div
     draggable
     onDragStart={handleDragStart}
     className={`absolute flex flex-col items-center justify-center p-3 w-24 h-24 rounded-xl shadow-lg cursor-move transition-all duration-300 transform hover:scale-[1.02] active:scale-95 border-2 ${node.panel === 'Source' ? 'border-gray-500 hover:border-red-500' : 'border-emerald-500 hover:border-emerald-700'} bg-white/90 backdrop-blur-sm`}
     style={{ left: `${node.x}%`, top: `${node.y}%` }}
>
<div className={`p-2 rounded-full ${bgColor} text-white shadow-md mb-1`}>
<Icon size={24} />
</div>
<p className="text-xs font-semibold text-gray-700 truncate w-full text-center">
       {node.name}
</p>
<StatusIcon size={14} className={`absolute top-1 right-1 ${color}`} />
</div>
 );
};
/**
* Toolbox component: Contains draggable icons for new services.
*/
const Toolbox = ({ dispatch }) => {
 const handleDragStart = (e, type) => {
   e.dataTransfer.setData('toolType', type);
   e.dataTransfer.setData('isExisting', 'false');
   dispatch({ type: 'SELECT_TOOL', payload: type });
 };
 return (
<div className="p-4 bg-gray-50/50 rounded-lg shadow-inner backdrop-blur-sm border border-gray-200">
<h3 className="text-sm font-bold text-gray-600 mb-3 uppercase tracking-wider">AWS Services</h3>
<div className="grid grid-cols-2 gap-3">
       {Object.entries(SERVICE_ICONS).map(([type, { icon: Icon, color }]) => (
<div
           key={type}
           draggable
           onDragStart={(e) => handleDragStart(e, type)}
           className="flex flex-col items-center justify-center p-2 rounded-lg bg-white shadow-md cursor-grab transition-colors duration-150 hover:bg-gray-100/80 active:ring-2 active:ring-offset-2 active:ring-blue-500"
           style={{ touchAction: 'none' }}
>
<div className={`p-1 rounded-full ${color} text-white mb-1`}>
<Icon size={20} />
</div>
<span className="text-xs font-medium text-gray-700">{type}</span>
</div>
       ))}
</div>
</div>
 );
};
/**
* CanvasPanel component: Represents either the Source or Target architecture panel.
*/
const CanvasPanel = ({ panelName, nodes, dispatch, authReady }) => {
 const isSource = panelName === 'Source';
 const filteredNodes = nodes.filter(n => n.panel === panelName);
 const title = isSource ? 'Source Architecture (On-Prem / VM)' : 'Target Architecture (AWS Cloud)';
 const colorClass = isSource ? 'border-gray-300 bg-gray-50/50' : 'border-emerald-400 bg-emerald-50/50';
 const handleDrop = useCallback((e) => {
   e.preventDefault();
   if (!authReady) return;
   const canvasRect = e.currentTarget.getBoundingClientRect();
   // Calculate position as percentage of the container size
   const x = ((e.clientX - canvasRect.left) / canvasRect.width) * 100;
   const y = ((e.clientY - canvasRect.top) / canvasRect.height) * 100;
   const nodeId = e.dataTransfer.getData('nodeId');
   const toolType = e.dataTransfer.getData('toolType');
   const isExisting = e.dataTransfer.getData('isExisting') === 'true';
   if (isExisting && nodeId) {
     // 1. Moving an existing node (Drag and Drop position update)
     const nodeToMove = nodes.find(n => n.id === nodeId);
     if (nodeToMove.panel === 'Source' && panelName === 'Target') {
       // 2. Migration Action: Moving a node from Source to Target
       dispatch({
         type: 'INITIATE_MIGRATION',
         payload: { id: nodeId, name: nodeToMove.name }
       });
       // We simulate the position update here as well
       dispatch({
         type: 'UPDATE_NODE',
         payload: { id: nodeId, updates: { x: x, y: y, panel: panelName } }
       });
     } else {
       // Simple move within the same panel or from Target back to Source (no migration trigger)
       dispatch({
         type: 'UPDATE_NODE',
         payload: { id: nodeId, updates: { x: x, y: y, panel: panelName } }
       });
     }
   } else if (toolType) {
     // 3. Adding a new node from the Toolbox
     const newNode = {
       id: generateId(),
       type: toolType,
       name: `${toolType}-${nodes.length + 1}`,
       x: x,
       y: y,
       panel: panelName,
       status: 'IDLE',
     };
     dispatch({ type: 'SET_NODES', payload: [...nodes, newNode] });
   }
 }, [nodes, dispatch, panelName, authReady]);
 const handleDragOver = (e) => {
   e.preventDefault(); // Essential to allow dropping
   e.dataTransfer.dropEffect = 'move';
 };
 return (
<div
     onDrop={handleDrop}
     onDragOver={handleDragOver}
     className={`relative h-full min-h-[30rem] rounded-xl border-4 border-dashed ${colorClass} p-4 transition-colors duration-300`}
     style={{ touchAction: 'manipulation' }} // Better touch handling
>
<h2 className={`text-xl font-extrabold mb-4 text-center ${isSource ? 'text-gray-600' : 'text-emerald-700'}`}>
       {title}
</h2>
<p className={`text-sm text-center italic ${isSource ? 'text-gray-500' : 'text-emerald-600'} mb-2`}>
       {isSource ? 'Drag components here. Move to Target to start migration.' : 'Migrated components running in AWS.'}
</p>
     {/* Render the nodes */}
     {filteredNodes.map(node => (
<Node key={node.id} node={node} dispatch={dispatch} />
     ))}
     {filteredNodes.length === 0 && (
<div className="absolute inset-0 flex items-center justify-center text-gray-400 text-lg font-medium opacity-60 pointer-events-none">
         {isSource ? 'Drag services here to build architecture' : 'Migrated services will appear here'}
</div>
     )}
</div>
 );
};

// --------------------------------------------------------------------------------
// ---------------------------- MAIN APP COMPONENT --------------------------------
// --------------------------------------------------------------------------------
const App = () => {
 const [state, dispatch] = useReducer(diagramReducer, initialDiagramState);
 const [db, setDb] = useState(null);
 const [auth, setAuth] = useState(null);
 const [userId, setUserId] = useState(null);
 const [isAuthReady, setIsAuthReady] = useState(false);
 const [error, setError] = useState(null);
 const { nodes, migrationStatus } = state;
 // --- 1. FIREBASE INITIALIZATION AND AUTH ---
 useEffect(() => {
   try {
     if (Object.keys(firebaseConfig).length === 0) {
       console.error("Firebase config not available. Running in local mode.");
       setIsAuthReady(true);
       return;
     }
     const app = initializeApp(firebaseConfig);
     const firestore = getFirestore(app);
     const authentication = getAuth(app);
     setDb(firestore);
     setAuth(authentication);
     onAuthStateChanged(authentication, async (user) => {
       if (!user) {
         try {
           if (initialAuthToken) {
             await signInWithCustomToken(authentication, initialAuthToken);
           } else {
             await signInAnonymously(authentication);
           }
         } catch (e) {
           console.error("Authentication failed:", e);
         }
       }
       setUserId(authentication.currentUser?.uid || crypto.randomUUID());
       setIsAuthReady(true);
     });
   } catch (e) {
     setError("Firebase Initialization Error. Check console.");
     setIsAuthReady(true);
     console.error("Firebase Init Error:", e);
   }
 }, []);
 // --- 2. FIRESTORE REAL-TIME DATA LISTENER (READ) ---
 useEffect(() => {
   if (db && userId) {
     const diagramRef = doc(db, `artifacts/${appId}/users/${userId}/diagrams`, 'current_diagram');
     const unsubscribe = onSnapshot(diagramRef, (docSnap) => {
       if (docSnap.exists()) {
         const data = docSnap.data();
         // Ensure nodes array is present and valid
         if (Array.isArray(data.nodes)) {
           dispatch({ type: 'SET_NODES', payload: data.nodes });
         }
       } else {
         // Document doesn't exist, initialize with empty state on first run
         dispatch({ type: 'SET_NODES', payload: [] });
       }
     }, (e) => {
       console.error("Firestore Listener Error:", e);
       setError("Failed to load diagram data.");
     });
     return () => unsubscribe(); // Clean up listener on component unmount
   }
 }, [db, userId]);
 // --- 3. FIRESTORE DATA WRITER (WRITE) ---
 useEffect(() => {
   // This effect runs whenever 'nodes' or 'migrationStatus' changes and saves the data.
   if (db && userId && isAuthReady) {
     const diagramRef = doc(db, `artifacts/${appId}/users/${userId}/diagrams`, 'current_diagram');
     // Throttle or debounce could be added here for high-frequency updates, but we'll
     // rely on React's batched state updates for now.
     setDoc(diagramRef, { nodes, lastUpdated: new Date() }).catch(e => {
       console.error("Firestore Save Error:", e);
       setError("Failed to save diagram changes.");
     });
   }
 }, [nodes, db, userId, isAuthReady]);
 // --- 4. SIMULATE MGN MIGRATION STATUS ---
 useEffect(() => {
   if (migrationStatus && migrationStatus.status === 'Starting') {
     const { id, name } = migrationStatus;
     // Stage 1: AWS MGN Replication (2 seconds)
     const stage1 = setTimeout(() => {
       dispatch({ type: 'SET_STATUS', payload: { id, name, status: 'Replicating Data...' } });
     }, 2000);
     // Stage 2: Ready for Cutover (4 seconds)
     const stage2 = setTimeout(() => {
       dispatch({ type: 'SET_STATUS', payload: { id, name, status: 'Ready for Cutover!' } });
     }, 4000);
     // Stage 3: Cutover Complete (6 seconds)
     const stage3 = setTimeout(() => {
       dispatch({ type: 'SET_STATUS', payload: { id, name, status: 'Cutover Complete!' } });
       dispatch({ type: 'UPDATE_NODE', payload: { id, updates: { status: 'SUCCESS' } } });
     }, 6000);
     // Stage 4: Reset status (7 seconds)
     const stage4 = setTimeout(() => {
       dispatch({ type: 'SET_STATUS', payload: null });
     }, 7000);
     return () => {
       clearTimeout(stage1);
       clearTimeout(stage2);
       clearTimeout(stage3);
       clearTimeout(stage4);
     };
   }
 }, [migrationStatus, dispatch]);
 const handleReset = () => {
   // Reset all nodes to IDLE and place them back in the Source panel
   const resetNodes = nodes.map(node => ({
     ...node,
     panel: 'Source',
     status: 'IDLE',
     // Reset position to a default for the Source panel
     x: Math.random() * 50 + 20,
     y: Math.random() * 50 + 20,
   }));
   dispatch({ type: 'SET_NODES', payload: resetNodes });
   dispatch({ type: 'SET_STATUS', payload: null });
 };

 if (!isAuthReady) {
   return (
<div className="flex items-center justify-center h-screen bg-gray-900 text-white">
<Loader2 className="animate-spin mr-2" /> Initializing Application...
</div>
   );
 }
 return (
<div className="min-h-screen bg-gray-100 font-inter p-4 md:p-6 flex flex-col">
<header className="bg-white p-4 rounded-xl shadow-lg mb-6 border-b-4 border-blue-500">
<div className="flex flex-col md:flex-row justify-between items-start md:items-center">
<div className='flex items-center'>
<GitPullRequest size={32} className="text-blue-600 mr-3" />
<h1 className="text-2xl md:text-3xl font-extrabold text-gray-800">
             AWS Migration Diagrammer
</h1>
</div>
<div className="mt-2 md:mt-0 flex items-center space-x-3">
<button
             onClick={handleReset}
             className="px-4 py-2 bg-yellow-500 text-white rounded-lg shadow-md hover:bg-yellow-600 transition-colors font-medium text-sm flex items-center"
             title="Reset all components to Source and clear status"
>
<RefreshCw size={16} className="mr-1" />
             Reset Diagram
</button>
<span className="text-xs md:text-sm font-mono text-gray-500 bg-gray-100 p-2 rounded-md flex items-center">
<User size={14} className="mr-1 text-blue-500" />
             User: {userId.substring(0, 8)}...
</span>
</div>
</div>
</header>
     {/* Main Content Grid */}
<main className="flex-grow grid grid-cols-1 lg:grid-cols-4 gap-6">
       {/* Toolbox / Migration Status Column (Left) */}
<div className="lg:col-span-1 flex flex-col space-y-6">
<Toolbox dispatch={dispatch} />
         {/* Migration Status Panel */}
<div className="p-4 bg-white rounded-xl shadow-lg flex-grow border border-gray-200">
<h3 className="text-sm font-bold text-gray-600 mb-3 uppercase tracking-wider flex items-center">
<Zap size={16} className="mr-1 text-blue-500" />
             MGN Status Simulation
</h3>
<div className="min-h-[10rem] p-3 bg-gray-50 rounded-lg border border-gray-200">
             {error && (
<div className="p-2 bg-red-100 border border-red-400 text-red-700 rounded-md text-sm">
                 {error}
</div>
             )}
             {migrationStatus ? (
<div className="flex items-center space-x-2 p-2 bg-blue-50 border border-blue-300 rounded-md shadow-sm animate-pulse">
<Loader2 className="animate-spin text-blue-600" size={18} />
<div className='text-sm'>
<p className="font-semibold text-blue-800">
                     Migrating: {migrationStatus.name}
</p>
<p className="text-blue-700 text-xs">
                     Status: {migrationStatus.status}
</p>
</div>
</div>
             ) : (
<p className="text-gray-500 text-sm italic">
                 Drag a service from Source to Target to initiate a simulated migration (MGN API call).
</p>
             )}
</div>
</div>
</div>
       {/* Canvas Panels (Right - 2/3rds width) */}
<div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
<CanvasPanel
           panelName="Source"
           nodes={nodes}
           dispatch={dispatch}
           authReady={isAuthReady}
         />
<CanvasPanel
           panelName="Target"
           nodes={nodes}
           dispatch={dispatch}
           authReady={isAuthReady}
         />
</div>
</main>
<footer className="mt-6 text-center text-sm text-gray-500 border-t pt-4">
       Diagrammer Prototype | State managed by Firebase Firestore | Simulated AWS MGN Integration.
</footer>
</div>
 );
};
export default App;