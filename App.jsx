import React, { useState, useEffect, useCallback, useRef } from 'react';
// Import Firebase modules
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import {
 getFirestore, collection, onSnapshot, doc,
 updateDoc, addDoc, serverTimestamp, setDoc
} from 'firebase/firestore';
// Import only necessary icons from lucide-react
import {
 Server, Database, Loader2, CheckCircle,
 AlertTriangle, Zap, HardDrive, Bell, Network, Settings,
 X, Code, Map, Globe, ChevronLeft, Layers3,
 ListChecks, Cpu, Shield, Users, Monitor, BookOpen
} from 'lucide-react';
// =================================================================
// --- LOCAL DEVELOPMENT PLACEHOLDER DEFINITIONS (CRITICAL FOR LINTER) ---
// Note: These definitions are necessary for the component to compile in a non-Canvas environment.
const __app_id = 'migration-architect';
const __firebase_config = JSON.stringify({
   apiKey: 'DUMMY_KEY_FOR_LOCAL_LINTER',
   projectId: 'local-dev-project',
});
const __initial_auth_token = null;
// =================================================================
// --- Global Variables (Mandatory Canvas Environment Variables) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
// --- Data & Configuration ---
// Attributes are defined as [label (must be camelCase/PascalCase to be used as object key), description, type (optional, default: text)]
const PRE_MIGRATION_ATTRIBUTES = {
   'onprem-server': [
       ['ServerName', 'Unique identifier for the server.', 'text'],
       ['OS', 'Operating System (e.g., Windows 2019, RHEL 8).', 'text'],
       ['CPU_Cores', 'Number of allocated CPU cores.', 'number'],
       ['RAM_GB', 'Total RAM in GB.', 'number'],
       ['Storage_Disks', 'Details of connected storage disks (e.g., 3x 500GB).', 'text'],
       ['IsClusterNode', 'Part of a failover cluster?', 'checkbox']
   ],
   'onprem-db': [
       ['DBEngine', 'Database engine (e.g., SQL Server, PostgreSQL).', 'text'],
       ['DBVersion', 'Specific version number.', 'text'],
       ['LicenseType', 'License model used.', 'text'],
       ['DataSize_GB', 'Current size of data files in GB.', 'number'],
       ['BackupMethod', 'Current backup frequency and method.', 'text']
   ],
   'onprem-lb': [
       ['Model', 'Load Balancer model/vendor.', 'text'],
       ['IPAddress', 'External IP Address.', 'text'],
       ['ProtocolPorts', 'Ports configured for listening (e.g., 80, 443).', 'text']
   ],
   'onprem-network': [
       ['VLAN_ID', 'VLAN tag or ID.', 'text'],
       ['Subnet_CIDR', 'Local subnet CIDR block.', 'text'],
       ['FirewallRules', 'Number of ingress firewall rules.', 'number']
   ],
};
const POST_MIGRATION_ATTRIBUTES = {
   'aws-ec2': [
       ['InstanceType', 'Target EC2 instance type (e.g., m5.large).', 'text'],
       ['AMI_ID', 'Target Golden AMI ID.', 'text'],
       ['SecurityGroup_ID', 'Primary Security Group ID.', 'text'],
       ['TargetSubnet', 'Target Subnet ID (e.g., subnet-abc123).', 'text'],
       ['MonitorSetup', 'Is CloudWatch monitoring enabled?', 'checkbox']
   ],
   'aws-rds': [
       ['DBEngine', 'Target RDS engine (e.g., Aurora PostgreSQL).', 'text'],
       ['AllocatedStorage_GB', 'Target storage allocation in GB.', 'number'],
       ['MultiAZ_Enabled', 'Is Multi-AZ enabled for redundancy?', 'checkbox'],
       ['BackupRetentionDays', 'Automated backup retention days.', 'number']
   ],
   'aws-elb': [
       ['Type', 'ELB Type (ALB/NLB).', 'text'],
       ['TargetGroup_ARN', 'Associated Target Group ARN.', 'text'],
       ['Listener_Ports', 'Listening ports (e.g., 80, 443).', 'text'],
       ['WAF_Enabled', 'Is AWS WAF enabled?', 'checkbox']
   ],
   'aws-vpc': [
       ['CIDR_Block', 'VPC CIDR Block (e.g., 10.0.0.0/16).', 'text'],
       ['AvailabilityZone', 'Availability Zone.', 'text'],
       ['NatGatewayID', 'ID of the NAT Gateway used.', 'text']
   ],
};

// Rich component palette with migration attributes
const INFRA_COMPONENTS = {
 // Source Components
 'onprem-server': { id: 'onprem-server', name: 'App Server (VM)', icon: Server, color: 'bg-blue-600', isSource: true, preChecklist: PRE_MIGRATION_ATTRIBUTES['onprem-server'] },
 'onprem-db': { id: 'onprem-db', name: 'Database (VM)', icon: Database, color: 'bg-indigo-600', isSource: true, preChecklist: PRE_MIGRATION_ATTRIBUTES['onprem-db'] },
 'onprem-lb': { id: 'onprem-lb', name: 'Load Balancer', icon: Zap, color: 'bg-green-600', isSource: true, preChecklist: PRE_MIGRATION_ATTRIBUTES['onprem-lb'] },
 'onprem-network': { id: 'onprem-network', name: 'Network Gateway', icon: Network, color: 'bg-gray-500', isSource: true, preChecklist: PRE_MIGRATION_ATTRIBUTES['onprem-network'] },
 // AWS Target Components (Simulated AWS Icons)
 'aws-ec2': { id: 'aws-ec2', name: 'EC2 Instance', icon: Cpu, color: 'bg-orange-500', isSource: false, postChecklist: POST_MIGRATION_ATTRIBUTES['aws-ec2'] },
 'aws-rds': { id: 'aws-rds', name: 'RDS Instance', icon: Database, color: 'bg-red-500', isSource: false, postChecklist: POST_MIGRATION_ATTRIBUTES['aws-rds'] },
 'aws-elb': { id: 'aws-elb', name: 'ELB (ALB/NLB)', icon: Shield, color: 'bg-teal-500', isSource: false, postChecklist: POST_MIGRATION_ATTRIBUTES['aws-elb'] },
 'aws-vpc': { id: 'aws-vpc', name: 'VPC/Subnet', icon: HardDrive, color: 'bg-sky-500', isSource: false, postChecklist: POST_MIGRATION_ATTRIBUTES['aws-vpc'] },
};
// Simplified status map for the dashboard
const STATUS_MAP = {
 Initiating: { icon: Loader2, color: 'text-yellow-500', label: 'Migration Requested' },
 Replicating: { icon: Loader2, color: 'text-blue-500', label: 'Data Replication In Progress' },
 'Cutover Pending': { icon: Zap, color: 'text-purple-500', label: 'Ready for Cutover' },
 Completed: { icon: CheckCircle, color: 'text-green-500', label: 'Migration Completed' },
 Failed: { icon: AlertTriangle, color: 'text-red-500', label: 'Migration Failed' },
};
// --- CORE APPLICATION COMPONENT ---
const App = () => {
 // --- STATE ---
 const [db, setDb] = useState(null);
 const [userId, setUserId] = useState(null);
 const [isAuthReady, setIsAuthReady] = useState(false);
 const [isSidebarOpen, setIsSidebarOpen] = useState(true);
 const isLocalDevRef = useRef(false); // Ref to track local dev mode
 const [currentPage, setCurrentPage] = useState('details');
 const [appDetails, setAppDetails] = useState({
   appName: 'New Migration Project',
   sourceEnv: 'onprem',
   targetRegion: 'us-east-1',
 });
 const [migrations, setMigrations] = useState([]);
 const [architectureData, setArchitectureData] = useState({
   sourceNodes: [],
   targetNodes: [],
   connections: [],
   nextComponentId: 1,
 });
 const [notification, setNotification] = useState({ message: '', type: '' });
 // --- UTILITIES & FIREBASE LOGIC ---
 const showNotification = useCallback((message, type = 'info') => {
   setNotification({ message, type });
   setTimeout(() => setNotification({ message: '', type: '' }), 4000);
 }, []);
 const getCollectionPath = useCallback((collectionName) => {
   if (!userId) return null;
   return `/artifacts/${appId}/users/${userId}/${collectionName}`;
 }, [userId]);
 const initializeFirebase = useCallback(async () => {
   // Check if configuration is missing or if we are using the local development placeholder
   const isLocal = firebaseConfig?.apiKey === 'DUMMY_KEY_FOR_LOCAL_LINTER';
   isLocalDevRef.current = isLocal; // Set ref value
   if (!firebaseConfig || Object.keys(firebaseConfig).length === 0 || isLocal) {
       // Set a recognizable local userId for architectural stability but prevent actual auth/db calls
       console.warn("Running in local development mode. Firebase connection skipped. Data persistence will be disabled.");
       setUserId('local-dev-user-id');
       setIsAuthReady(true);
       return;
   }
   try {
     const app = initializeApp(firebaseConfig);
     const firestore = getFirestore(app);
     const userAuth = getAuth(app);
     if (initialAuthToken) {
       await signInWithCustomToken(userAuth, initialAuthToken);
     } else {
       await signInAnonymously(userAuth);
     }
     const currentUserId = userAuth.currentUser?.uid || 'anonymous-fallback';
     setDb(firestore);
     setUserId(currentUserId);
   } catch (error) {
     console.error("Critical Firebase Setup Error:", error);
     setUserId('error-state-' + Date.now());
     // Do not show error notification in production/preview, only console error
   } finally {
     setIsAuthReady(true);
   }
 }, []);
 useEffect(() => {
   const timer = setTimeout(() => initializeFirebase(), 500);
   return () => clearTimeout(timer);
 }, [initializeFirebase]);
 // Data loading/listener effects
 useEffect(() => {
   // Prevent execution if not ready, running in local dev, or error state
   if (!isAuthReady || !db || !userId || userId.startsWith('error-state') || isLocalDevRef.current) return;
   const detailsDocRef = doc(db, getCollectionPath('app_config'), 'current');
   const unsubscribe = onSnapshot(detailsDocRef, (docSnap) => {
     if (docSnap.exists()) {
       const data = docSnap.data();
       if (data.appDetails) setAppDetails(data.appDetails);
       if (data.architectureData) setArchitectureData(data.architectureData);
     } else {
       const initialData = {
           appDetails,
           architectureData,
           createdAt: serverTimestamp()
       };
       // Use setDoc for initial write with merge: true to avoid overwriting and ensure creation
       setDoc(detailsDocRef, initialData, { merge: true }).catch(e => console.error("Initial doc write error:", e));
     }
   }, (error) => {
     console.error("Error loading app config:", error);
   });
   return () => unsubscribe();
 }, [isAuthReady, db, userId, getCollectionPath, appDetails, architectureData]);
 useEffect(() => {
   // Prevent execution if not ready, running in local dev, or error state
   if (!isAuthReady || !db || !userId || userId.startsWith('error-state') || isLocalDevRef.current) return;
   const collectionPath = getCollectionPath('migrations');
   if (!collectionPath) return;
   const migrationCollectionRef = collection(db, collectionPath);
   const unsubscribe = onSnapshot(migrationCollectionRef, (snapshot) => {
     const migrationList = snapshot.docs.map(doc => ({
       id: doc.id,
       ...doc.data(),
       requestedAtMs: doc.data().requestedAt?.toMillis() || 0,
     }));
     migrationList.sort((a, b) => b.requestedAtMs - a.requestedAtMs);
     setMigrations(migrationList);
   }, (error) => {
     console.error("Error listening to migrations:", error);
   });
   return () => unsubscribe();
 }, [isAuthReady, db, userId, getCollectionPath]);
 // Data persistence handler (now only for architecture updates)
 const saveConfig = useCallback((newAppDetails = appDetails, newArchitectureData = architectureData) => {
   if (isLocalDevRef.current) {
       showNotification("Configuration changed but not saved: Running in local mode.", 'info');
       return;
   }
   if (!db || !userId || userId.startsWith('error-state')) {
       showNotification("Cannot save: Database connection failed.", 'error');
       return;
   }
   const detailsDocRef = doc(db, getCollectionPath('app_config'), 'current');
   setDoc(detailsDocRef, { appDetails: newAppDetails, architectureData: newArchitectureData, updatedAt: serverTimestamp() }, { merge: true })
     .then(() => showNotification('Configuration saved!', 'success'))
     .catch(e => {
       console.error("Save error:", e);
       showNotification(`Failed to save configuration: ${e.message}`, 'error');
     });
 }, [db, userId, getCollectionPath, showNotification, appDetails, architectureData]);
 // Migration simulation (unchanged)
 useEffect(() => {
   // Prevent execution if not ready, running in local dev, or error state
   if (!db || !userId || !migrations.length || userId.startsWith('error-state') || isLocalDevRef.current) return;
   const interval = setInterval(() => {
     migrations.forEach(migration => {
       if (migration.status !== 'Completed' && migration.status !== 'Failed') {
         const statuses = ['Initiating', 'Replicating', 'Cutover Pending', 'Completed', 'Failed'];
         const currentIndex = statuses.indexOf(migration.status);
         const newStatus = statuses[currentIndex + 1] || (Math.random() > 0.8 ? 'Failed' : 'Completed');
         const docRef = doc(db, getCollectionPath('migrations'), migration.id);
         updateDoc(docRef, { status: newStatus }).catch(e => console.error("Sim update error:", e));
       }
     });
   }, 5000);
   return () => clearInterval(interval);
 }, [db, userId, migrations, getCollectionPath]);
 // --- ARCHITECTURAL GUIDANCE UTILITY (Moved to App scope) ---
 const validateArchitecture = useCallback((nodes, connections, isSourcePhase) => {
   let warnings = 0;
   let errors = 0;
   // Filter connections relevant to the current phase
   const phaseConnections = connections.filter(c => c.isSourceConnection === isSourcePhase);
   // Rule 1: All components must have details filled out (Warning/Error)
   const nodesMissingDetails = nodes.filter(n => !n.isDetailed);
   if (nodesMissingDetails.length > 0) warnings++;
   // Rule 2: Check for isolated components (Error)
   const isolatedNodes = nodes.filter(node =>
       !phaseConnections.some(c => c.sourceId === node.id || c.targetId === node.id)
   );
   // Only count as error if there are nodes AND connections are required
   if (isolatedNodes.length > 0 && nodes.length > 1) errors++;
   return { warnings, errors, isComplete: (warnings === 0 && errors === 0), isolatedNodes };
 }, []);
 // --- RENDER HELPERS ---
 const PageButton = ({ id, label, icon: Icon, step }) => (
<button
     onClick={() => setCurrentPage(id)}
     className={`flex items-center w-full px-4 py-3 rounded-xl transition-all duration-200 text-sm font-semibold
       ${currentPage === id
           ? 'bg-indigo-600 text-white shadow-lg'
           : 'text-gray-600 hover:bg-indigo-100 hover:text-indigo-800'
       }`
     }
>
       {isSidebarOpen ? (
<>
<span className='mr-3 text-lg font-bold'>{step}.</span>
<Icon className='w-5 h-5 mr-3'/>
               {label}
</>
       ) : (
<Icon className={`w-6 h-6 ${currentPage === id ? '' : 'mx-auto'}`} />
       )}
</button>
 );
 // --- KICKOFF MIGRATION (FIXED GUIDANCE CHECK SCOPE) ---
 const handleKickoffMigration = async () => {
   // Recalculate guidance before check
   const sourceGuidance = validateArchitecture(architectureData.sourceNodes, architectureData.connections, true);
   const targetGuidance = validateArchitecture(architectureData.targetNodes, architectureData.connections, false);
   if (!sourceGuidance.isComplete || !targetGuidance.isComplete) {
       showNotification("Both Source (Pre-Migration Checklist) and Target (Post-Migration Checklist) architectures must be fully detailed and connected before migration kickoff!", 'warning');
       return;
   }
   // Check for local dev state before proceeding with firestore write
   if (isLocalDevRef.current) {
     showNotification("Migration logic skipped: Running in local development mode without database connection.", 'warning');
     setCurrentPage('status');
     return;
   }
   const migratableNodes = architectureData.sourceNodes.filter(n => n.isDetailed);
   if (migratableNodes.length === 0) {
       showNotification("No detailed Source Components found to migrate.", 'error');
       return;
   }
   try {
       const migrationCollectionRef = collection(db, getCollectionPath('migrations'));
       for (const node of migratableNodes) {
           // Simple logic: associate source node with a valid target EC2 instance if one exists
           const targetNode = architectureData.targetNodes.find(t => t.type === 'aws-ec2' && t.isDetailed);
           await addDoc(migrationCollectionRef, {
               appId: appDetails.appName,
               sourceComponentId: node.id,
               sourceComponentName: node.name,
               sourceDetails: node.details,
               targetRegion: appDetails.targetRegion,
               targetComponentName: targetNode ? targetNode.name : 'Unspecified EC2',
               status: 'Initiating',
               requestedAt: serverTimestamp(),
               mgnJobId: 'MGN-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
           });
       }
       showNotification(`${migratableNodes.length} migration job(s) initiated via MGN!`, 'success');
       setCurrentPage('status');
   } catch (e) {
       console.error("Error initiating migration:", e);
       showNotification(`Error initiating migration: ${e.message}`, 'error');
   }
 };

 // --- APP DETAILS PAGE ---
 const AppDetailsPage = () => {
   // *** FIX 1: Change to handle just navigation since saving is failing locally ***
   const handleContinue = () => {
       if (!appDetails.appName) {
           showNotification('Application Name is required.', 'warning');
           return;
       }
       // Instead of saveConfig, just update local state and navigate
       setAppDetails(appDetails); // Ensure latest details are in state
       setCurrentPage('architecture'); // Move to step 2
   };
   return (
<div className="p-8 bg-white shadow-xl rounded-xl border border-gray-100 max-w-4xl mx-auto">
<h2 className="text-3xl font-extrabold text-indigo-700 mb-6 flex items-center">
<Settings className="w-6 h-6 mr-3" />
               1. Migration Scope and Setup
</h2>
<p className="text-gray-600 mb-8">Define the basic parameters for your migration project.</p>
<div className="space-y-6">
               {/* Application Name */}
<div>
<label htmlFor="appName" className="block text-lg font-semibold text-gray-800 mb-2 flex items-center">
<ListChecks className='w-4 h-4 mr-2 text-indigo-500'/> Application Name
</label>
<input
                       id="appName"
                       type="text"
                       value={appDetails.appName}
                       onChange={(e) => setAppDetails(prev => ({ ...prev, appName: e.target.value }))}
                       className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-gray-700"
                       placeholder="e.g., Core Banking System"
                       required
                   />
</div>
               {/* Source Environment */}
<div>
<label htmlFor="sourceEnv" className="block text-lg font-semibold text-gray-800 mb-2 flex items-center">
<Users className='w-4 h-4 mr-2 text-indigo-500'/> Source Environment Type
</label>
<select
                       id="sourceEnv"
                       value={appDetails.sourceEnv}
                       onChange={(e) => setAppDetails(prev => ({ ...prev, sourceEnv: e.target.value }))}
                       className="w-full p-4 border border-gray-300 bg-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none text-gray-700"
>
<option value="onprem">On-Premises (to AWS)</option>
<option value="aws-to-aws">AWS to AWS (e.g., Region migration)</option>
</select>
</div>
               {/* Target Region */}
<div>
<label htmlFor="targetRegion" className="block text-lg font-semibold text-gray-800 mb-2 flex items-center">
<Globe className='w-4 h-4 mr-2 text-indigo-500'/> Target AWS Region
</label>
<select
                       id="targetRegion"
                       value={appDetails.targetRegion}
                       onChange={(e) => setAppDetails(prev => ({ ...prev, targetRegion: e.target.value }))}
                       className="w-full p-4 border border-gray-300 bg-white rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none text-gray-700"
>
<option value="us-east-1">US East (N. Virginia) - us-east-1</option>
<option value="eu-west-1">EU (Ireland) - eu-west-1</option>
<option value="ap-southeast-2">Asia Pacific (Sydney) - ap-southeast-2</option>
<option value="sa-east-1">South America (São Paulo) - sa-east-1</option>
</select>
</div>
</div>
<div className="mt-8 flex justify-end">
<button
                   onClick={handleContinue} // Updated to continue instead of save
                   className="flex items-center px-6 py-3 text-lg font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg disabled:opacity-50"
                   disabled={!appDetails.appName}
>
<CheckCircle className="w-5 h-5 mr-2" />
                   Continue to Design
</button>
</div>
</div>
   );
 };
 // --- ARCHITECTURE PLANNER ---
 const ArchitecturePlanner = () => {
   // Refs for each drop zone to calculate coordinates relative to that canvas
   const sourceDesignerRef = useRef(null);
   const targetDesignerRef = useRef(null);
   const [draggingComponent, setDraggingComponent] = useState(null);
   const [connectionContext, setConnectionContext] = useState({ nodeId: null, isSource: null });
   // Component Details Modal State
   const [detailModal, setDetailModal] = useState({
       isVisible: false,
       node: null,
       isSource: false
   });
   // --- DRAG HANDLERS ---
   const handleDragStart = (component) => (e) => {
     setDraggingComponent(component);
     e.dataTransfer.setData("text/plain", component.id);
   };
   const handleDragEnd = (e) => {
       setDraggingComponent(null);
   };
   // --- DROP HANDLER (Adds new node to canvas) ---
   const handleDrop = (e, targetType) => {
     e.preventDefault();
     const designerRef = targetType === 'source' ? sourceDesignerRef : targetDesignerRef;
     if (!draggingComponent || !designerRef.current) return;
     const rect = designerRef.current.getBoundingClientRect();
     const newX = e.clientX - rect.left - 30;
     const newY = e.clientY - rect.top - 30;
     // Basic bounds check
     if (newX < 0 || newY < 0 || newX > rect.width - 60 || newY > rect.height - 60) {
         showNotification("Component must be dropped within the designer area.", 'warning');
         setDraggingComponent(null);
         return;
     }
     const isSource = targetType === 'source';
     const activeSetKey = isSource ? 'sourceNodes' : 'targetNodes';
     const componentConfig = INFRA_COMPONENTS[draggingComponent.id];
     const newNode = {
       id: architectureData.nextComponentId,
       type: componentConfig.id,
       name: `${componentConfig.name.split('(')[0].trim()}-${architectureData.nextComponentId}`,
       x: newX,
       y: newY,
       details: {},
       isDetailed: false,
       isSource: isSource, // Important flag for filtering
     };
     setArchitectureData(prev => ({
       ...prev,
       [activeSetKey]: [...prev[activeSetKey], newNode],
       nextComponentId: prev.nextComponentId + 1,
     }));
     // *** FIX 2: Open detail modal immediately after creation ***
     // We open the modal using the newNode object which contains the ID
     setDetailModal({
       isVisible: true,
       node: newNode,
       isSource: isSource
     });
     setDraggingComponent(null);
   };
   // --- NODE CLICK HANDLER (Connection or Details) ---
   const handleNodeClick = (node, isSource) => {
     const { nodeId: startNodeId, isSource: startIsSource } = connectionContext;
     if (startNodeId === node.id) {
       setConnectionContext({ nodeId: null, isSource: null });
       return;
     }
     if (startNodeId !== null) {
       // Only allow connections within the same canvas (Source-to-Source or Target-to-Target)
       if (startIsSource !== isSource) {
           showNotification('Connections must be made within the same architecture (Source $\leftrightarrow$ Source or Target $\leftrightarrow$ Target).', 'warning');
           setConnectionContext({ nodeId: null, isSource: null });
           return;
       }
       // Complete connection
       const isDuplicate = architectureData.connections.some(c =>
           (c.sourceId === startNodeId && c.targetId === node.id && c.isSourceConnection === isSource) ||
           (c.sourceId === node.id && c.targetId === startNodeId && c.isSourceConnection === isSource)
       );
       if (isDuplicate) {
           showNotification('Connection already exists.', 'warning');
           setConnectionContext({ nodeId: null, isSource: null });
           return;
       }
       setArchitectureData(prev => ({
         ...prev,
         connections: [...prev.connections, {
           id: crypto.randomUUID(),
           sourceId: startNodeId,
           targetId: node.id,
           isSourceConnection: isSource,
         }]
       }));
       setConnectionContext({ nodeId: null, isSource: null });
       showNotification('Connection established!', 'info');
     } else {
       // Select start node
       setConnectionContext({ nodeId: node.id, isSource: isSource });
       showNotification(`Selected ${node.name}. Click another component in the SAME canvas to connect.`, 'info');
     }
   };
   // --- ARCHITECTURAL GUIDANCE (Used for display only) ---
   const sourceGuidance = validateArchitecture(architectureData.sourceNodes, architectureData.connections, true);
   const targetGuidance = validateArchitecture(architectureData.targetNodes, architectureData.connections, false);
   // --- RENDERING HELPERS ---
   const renderConnections = (isSource) => {
       const nodes = isSource ? architectureData.sourceNodes : architectureData.targetNodes;
       const phaseConnections = architectureData.connections.filter(c => c.isSourceConnection === isSource);
       return phaseConnections.map(c => {
           const sourceNode = nodes.find(n => n.id === c.sourceId);
           const targetNode = nodes.find(n => n.id === c.targetId);
           if (!sourceNode || !targetNode) return null;
           // Simple center calculation (60x60 component size)
           const x1 = sourceNode.x + 30;
           const y1 = sourceNode.y + 30;
           const x2 = targetNode.x + 30;
           const y2 = targetNode.y + 30;
           return (
<line
                   key={c.id}
                   x1={x1} y1={y1} x2={x2} y2={y2}
                   stroke="#4F46E5"
                   strokeWidth="3"
                   strokeLinecap="round"
                   className="transition-all duration-300"
               />
           );
       }).filter(line => line !== null);
   }
   const NodeComponent = ({ node, isSource }) => {
       const componentConfig = INFRA_COMPONENTS[node.type];
       const ComponentIcon = componentConfig.icon;
       const isSelected = connectionContext.nodeId === node.id;
       const currentGuidance = isSource ? sourceGuidance : targetGuidance;
       const isIsolated = currentGuidance.isolatedNodes.some(n => n.id === node.id);
       // Status indicator: Green check if isDetailed, Yellow settings if pending
       const statusIcon = node.isDetailed ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Settings className="w-4 h-4 text-yellow-500" />;
       return (
<div
               key={node.id}
               style={{ top: node.y, left: node.x }}
               className={`absolute w-16 h-16 p-2 rounded-xl shadow-xl border-2 flex flex-col items-center justify-center cursor-pointer transition-all duration-150 transform hover:scale-105
                   ${isSelected ? 'border-purple-500 ring-4 ring-purple-300' : 'border-gray-300'}
                   ${componentConfig.color}
               `}
               onClick={() => handleNodeClick(node, isSource)} // Connection handler
               onDoubleClick={() => setDetailModal({ isVisible: true, node: node, isSource: isSource })} // Details handler
               title={`Details: ${node.details.ServerName || node.details.DBEngine || node.name}`}
>
<ComponentIcon className="w-6 h-6 text-white" />
<span className="text-white text-xs mt-1 truncate max-w-full font-semibold">{node.name.substring(0, 10)}</span>
<div className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 p-0.5 bg-white rounded-full border border-gray-200">
                   {statusIcon}
</div>
               {isIsolated && <AlertTriangle className="absolute bottom-0 left-0 text-red-500 w-4 h-4" title="Isolated Component: Needs Connection" />}
<div className="absolute top-full text-xs mt-1 text-gray-700 w-full text-center pointer-events-none">
                   {node.details.ServerName || node.details.DBEngine || ''}
</div>
</div>
       );
   }
   // --- MAIN RENDER ---
   return (
<div className="flex flex-col h-full">
<div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-lg mb-4 border border-gray-100">
<h2 className="text-2xl font-bold text-gray-800 flex items-center">
<Map className="w-6 h-6 mr-3 text-indigo-600" />
               2. Architecture Designer: <span className='text-gray-500 ml-2'>{appDetails.appName}</span>
</h2>
</div>
<div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-grow">
           {/* Left Sidebar - Palette */}
<div className="col-span-12 md:col-span-3 lg:col-span-2 bg-white p-4 rounded-xl shadow-lg border border-gray-100 h-fit">
<h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
<Layers3 className="w-5 h-5 mr-2 text-indigo-600" />
                   Component Palette
</h3>
<p className='text-xs font-semibold text-gray-600 mb-2'>Source Components (Drag Left):</p>
<div className="space-y-3 mb-6">
                   {Object.values(INFRA_COMPONENTS).filter(c => c.isSource).map(c => (
<div
                       key={c.id}
                       draggable
                       onDragStart={handleDragStart(c)}
                       onDragEnd={handleDragEnd}
                       className={`p-3 rounded-lg flex items-center shadow-md cursor-grab transition-all duration-200
                       ${c.color} text-white hover:opacity-90`}
                       title="Drag to Source Architecture"
>
<c.icon className="w-5 h-5 mr-3" />
<span className="text-sm font-medium">{c.name}</span>
</div>
                   ))}
</div>
<p className='text-xs font-semibold text-gray-600 mb-2'>Target Components (Drag Right):</p>
<div className="space-y-3">
                   {Object.values(INFRA_COMPONENTS).filter(c => !c.isSource).map(c => (
<div
                       key={c.id}
                       draggable
                       onDragStart={handleDragStart(c)}
                       onDragEnd={handleDragEnd}
                       className={`p-3 rounded-lg flex items-center shadow-md cursor-grab transition-all duration-200
                       ${c.color} text-white hover:opacity-90`}
                       title="Drag to Target Architecture"
>
<c.icon className="w-5 h-5 mr-3" />
<span className="text-sm font-medium">{c.name}</span>
</div>
                   ))}
</div>
</div>
           {/* Main Content Area - Side-by-Side Canvases */}
<div className="col-span-12 md:col-span-9 lg:col-span-10 flex flex-col space-y-4">
               {/* Canvas Container */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-grow h-[80vh]">
                   {/* Source Architecture Canvas (Left) */}
<div className='flex flex-col'>
<h3 className="text-lg font-bold p-3 bg-indigo-100 text-indigo-800 rounded-t-xl flex justify-between items-center">
                           SOURCE Architecture ({appDetails.sourceEnv === 'onprem' ? 'On-Premises' : 'AWS'})
<span className={`text-sm font-medium ${sourceGuidance.isComplete ? 'text-green-600' : sourceGuidance.errors > 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                               {sourceGuidance.isComplete ? <CheckCircle className='w-4 h-4 inline mr-1'/> : <BookOpen className='w-4 h-4 inline mr-1'/>}
                               **Pre-Migration Checklist**: {sourceGuidance.errors > 0 ? 'Error' : sourceGuidance.isComplete ? 'Complete' : 'Pending'}
</span>
</h3>
<div
                           ref={sourceDesignerRef}
                           onDrop={(e) => handleDrop(e, 'source')}
                           onDragOver={(e) => e.preventDefault()}
                           className="relative w-full h-full bg-gray-50 border-4 border-dashed border-gray-300 rounded-b-xl overflow-hidden shadow-inner flex-grow"
>
<svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
                               {renderConnections(true)}
</svg>
                           {architectureData.sourceNodes.map(node => (
<NodeComponent key={node.id} node={node} isSource={true} />
                           ))}
</div>
</div>
                   {/* Target Architecture Canvas (Right) */}
<div className='flex flex-col'>
<h3 className="text-lg font-bold p-3 bg-indigo-100 text-indigo-800 rounded-t-xl flex justify-between items-center">
                           TARGET Architecture (AWS - {appDetails.targetRegion})
<span className={`text-sm font-medium ${targetGuidance.isComplete ? 'text-green-600' : targetGuidance.errors > 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                               {targetGuidance.isComplete ? <CheckCircle className='w-4 h-4 inline mr-1'/> : <Monitor className='w-4 h-4 inline mr-1'/>}
                               **Post-Migration Checklist**: {targetGuidance.errors > 0 ? 'Error' : targetGuidance.isComplete ? 'Complete' : 'Pending'}
</span>
</h3>
<div
                           ref={targetDesignerRef}
                           onDrop={(e) => handleDrop(e, 'target')}
                           onDragOver={(e) => e.preventDefault()}
                           className="relative w-full h-full bg-gray-50 border-4 border-dashed border-gray-300 rounded-b-xl overflow-hidden shadow-inner flex-grow"
>
<svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
                               {renderConnections(false)}
</svg>
                           {architectureData.targetNodes.map(node => (
<NodeComponent key={node.id} node={node} isSource={false} />
                           ))}
</div>
</div>
</div>
               {/* Kickoff Migration Button */}
<div className="mt-4 flex justify-end">
<button
                       onClick={() => handleKickoffMigration()}
                       className="flex items-center px-6 py-3 text-lg font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-xl disabled:opacity-50"
                       disabled={architectureData.targetNodes.length === 0 || !sourceGuidance.isComplete || !targetGuidance.isComplete}
>
<Zap className="w-5 h-5 mr-2" />
                       Kickoff Migration (AWS MGN Simulation)
</button>
</div>
</div>
</div>
       {/* Modal for Component Details/Checklist */}
       {detailModal.isVisible && detailModal.node && (
<ComponentDetailsModal
               node={detailModal.node}
               isSource={detailModal.isSource}
               closeModal={() => setDetailModal({ isVisible: false, node: null, isSource: false })}
               updateNode={(updatedNode) => {
                   setArchitectureData(prev => {
                       const key = updatedNode.isSource ? 'sourceNodes' : 'targetNodes';
                       // Find and update the node in the current set
                       const newNodes = prev[key].map(n => n.id === updatedNode.id ? updatedNode : n);
                       // Update the local architecture state
                       return { ...prev, [key]: newNodes };
                   });
                   // Call saveConfig with the updated state structure
                   const keyToSave = updatedNode.isSource ? 'sourceNodes' : 'targetNodes';
                   saveConfig(appDetails, {
                       ...architectureData,
                       // We need to pass the *new* list of nodes for the saved key,
                       // and keep the *old* list for the other key until the full state update propagates.
                       [keyToSave]: architectureData[keyToSave].map(n => n.id === updatedNode.id ? updatedNode : n)
                   });
               }}
               showNotification={showNotification}
           />
       )}
</div>
   );
 };
 // --- COMPONENT DETAIL MODAL (Now handles both Pre and Post Checklists) ---
 const ComponentDetailsModal = ({ node, isSource, closeModal, updateNode, showNotification }) => {
   const componentConfig = INFRA_COMPONENTS[node.type];
   const ComponentIcon = componentConfig.icon;
   const [tempDetails, setTempDetails] = useState(node.details || {});
   const [tempName, setTempName] = useState(node.name);
   // Determine which checklist to use
   const checklist = isSource ? componentConfig.preChecklist : componentConfig.postChecklist;
   const checklistTitle = isSource ? 'Pre-Migration Checklist' : 'Post-Migration Checklist';
   const ChecklistIcon = isSource ? BookOpen : Monitor;
   const handleSave = () => {
       // Validation: Ensure all checklist items are filled
       const isDetailed = checklist.every(([attr, , type]) => {
           const value = tempDetails[attr];
           if (type === 'checkbox') {
               // Checkboxes are considered 'filled' if they exist in the object (true/false)
               return value !== undefined;
           } else if (type === 'number') {
               // Numbers must be set, parsable, and non-empty string if not a number
               return value !== undefined && value !== null && value !== '' && !isNaN(parseFloat(value));
           }
           // Default text check
           return value !== undefined && value !== null && value !== '';
       });
       const updatedNode = {
           ...node,
           details: tempDetails,
           name: tempName,
           isDetailed: isDetailed, // Status is based on checklist completion
           isSource: isSource
       };
       updateNode(updatedNode);
       closeModal();
       showNotification(`Details for ${tempName} saved. Checklist status: ${isDetailed ? 'Complete' : 'Pending'}`, 'success');
   };
   const handleDetailChange = (attr, value, type) => {
       if (type === 'checkbox') {
           setTempDetails(prev => ({ ...prev, [attr]: value }));
       } else if (type === 'number') {
           // Store as string to allow user to type decimals/clear input, but validate later
           setTempDetails(prev => ({ ...prev, [attr]: value }));
       } else {
           setTempDetails(prev => ({ ...prev, [attr]: value }));
       }
   }

   return (
<div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-[100] p-4">
<div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 transform transition-all">
<div className="flex justify-between items-center border-b pb-3 mb-4">
<h3 className="text-xl font-bold text-gray-800 flex items-center">
<ComponentIcon className={`w-6 h-6 mr-2 ${componentConfig.color.replace('bg-', 'text-')}`} />
                       {isSource ? 'Source' : 'Target'} Details: {componentConfig.name}
</h3>
<button onClick={closeModal} className="text-gray-500 hover:text-gray-800 p-1 rounded-full hover:bg-gray-100"><X /></button>
</div>
<div className="space-y-4 max-h-96 overflow-y-auto pr-3">
                   {/* Component Name */}
<div>
<label className="block text-sm font-semibold text-gray-700 mb-1">Display Name</label>
<input
                           type="text"
                           value={tempName}
                           onChange={(e) => setTempName(e.target.value)}
                           className="w-full p-3 border border-gray-300 rounded-lg"
                       />
</div>
<hr/>
<h4 className="text-lg font-bold text-indigo-600 flex items-center mb-2">
<ChecklistIcon className='w-5 h-5 mr-2'/> {checklistTitle}
</h4>
                   {/* Dynamic Attributes (Checklist) */}
                   {checklist.map(([attr, description, type = 'text']) => (
<div key={attr} className="py-1">
                           {type === 'checkbox' ? (
<div className="flex items-center space-x-3">
<input
                                       id={attr}
                                       type="checkbox"
                                       checked={!!tempDetails[attr]}
                                       onChange={(e) => handleDetailChange(attr, e.target.checked, type)}
                                       className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                   />
<label htmlFor={attr} className="text-sm font-medium text-gray-700">
                                       {attr.replace('_', ' ')}: <span className="text-gray-500 font-normal italic">{description}</span>
</label>
</div>
                           ) : (
<>
<label className="block text-sm font-medium text-gray-700 mb-1">{attr.replace('_', ' ')}</label>
<input
                                       type={type === 'number' ? 'text' : type} // Use text input for numbers to allow for partial input without immediate error
                                       inputMode={type === 'number' ? 'numeric' : 'text'}
                                       value={tempDetails[attr] === undefined ? '' : tempDetails[attr]}
                                       onChange={(e) => handleDetailChange(attr, e.target.value, type)}
                                       className="w-full p-3 border border-gray-300 rounded-lg"
                                       placeholder={description}
                                   />
</>
                           )}
</div>
                   ))}
<p className="text-xs italic text-gray-500 pt-2">Completing all fields ensures proper data capture for the migration phase.</p>
</div>
<div className="mt-6 flex justify-end space-x-3">
<button onClick={closeModal} className="px-5 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 font-semibold">
                       Cancel
</button>
<button onClick={handleSave} className="px-5 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 font-semibold shadow-md">
                       Save Checklist
</button>
</div>
</div>
</div>
   );
 };
 // --- STATUS DASHBOARD PAGE (UNCHANGED) ---
 const StatusDashboard = () => (
<div className="p-8 bg-white shadow-xl rounded-xl border border-gray-100">
<h2 className="text-3xl font-extrabold text-indigo-700 mb-6 flex items-center">
<Globe className="w-6 h-6 mr-3" />
       3. Real-Time Migration Status
</h2>
<p className="text-gray-600 mb-6">Monitoring jobs for **{appDetails.appName || 'Selected Application'}** targeting **{appDetails.targetRegion}**.</p>
     {migrations.length === 0 ? (
<div className="text-center p-12 bg-gray-50 rounded-xl text-gray-500 border-dashed border-2">
<Zap className="w-10 h-10 mx-auto text-gray-400 mb-3" />
<p className='font-semibold'>No active migration jobs for this project.</p>
<p className='text-sm mt-1'>Initiate a migration from the Architecture Design page after confirming the target architecture.</p>
</div>
     ) : (
<div className="space-y-4">
         {migrations.map(migration => {
           const statusInfo = STATUS_MAP[migration.status] || STATUS_MAP['Initiating'];
           const ComponentIcon = statusInfo.icon;
           return (
<div
               key={migration.id}
               className="bg-white p-5 rounded-xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between border-l-4 border-indigo-500 transition-shadow hover:shadow-lg"
>
<div className="flex items-start w-full sm:w-1/2 mb-3 sm:mb-0">
<div className={`p-3 rounded-full mr-4 bg-blue-600`}>
<Server className="w-5 h-5 text-white" />
</div>
<div>
<p className="text-lg font-semibold text-gray-800">{migration.sourceComponentName}</p>
<p className="text-sm text-gray-500">
                       {migration.sourceDetails?.ServerName || 'VM/Instance'} $\to$ {migration.targetComponentName}
</p>
<p className="text-xs text-gray-400 mt-1">Job ID: {migration.mgnJobId}</p>
</div>
</div>
<div className="w-full sm:w-1/2 flex items-center justify-start sm:justify-end">
<ComponentIcon
                   className={`w-5 h-5 mr-2 ${statusInfo.color} ${
                     (migration.status === 'Initiating' || migration.status === 'Replicating') ? 'animate-spin' : ''
                   }`}
                 />
<span className={`font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
</div>
</div>
           );
         })}
</div>
     )}
</div>
 );

 // --- MAIN APPLICATION LAYOUT ---
 if (!isAuthReady) {
   return (
<div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
<Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
<span className="ml-2 text-lg text-gray-700">Initializing Migration Architect...</span>
</div>
   );
 }
 return (
<div className="flex min-h-screen bg-gray-100 font-sans">
<title>Migration Architect</title>
     {/* --- COLLAPSIBLE SIDEBAR NAVIGATION --- */}
<div
       className={`bg-white shadow-2xl transition-all duration-300 ease-in-out flex flex-col h-screen sticky top-0 z-20 border-r border-gray-200
           ${isSidebarOpen ? 'w-64 p-6' : 'w-20 p-4 items-center'}`
       }
>
       {/* Header/Toggle */}
<div className={`flex ${isSidebarOpen ? 'justify-between' : 'justify-center'} items-center mb-8`}>
<div className={`${isSidebarOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 flex items-center`}>
<Map className="w-7 h-7 mr-2 text-indigo-600" />
<h1 className="text-xl font-extrabold text-gray-800">Architect</h1>
</div>
<button
           onClick={() => setIsSidebarOpen(!isSidebarOpen)}
           className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
>
<ChevronLeft className={`w-6 h-6 transform transition-transform duration-300 ${isSidebarOpen ? '' : 'rotate-180'}`} />
</button>
</div>
       {/* Navigation Links */}
<nav className="flex-grow space-y-2">
<PageButton id="details" label="Scope Setup" icon={Settings} step={1} />
<PageButton id="architecture" label="Architecture Design" icon={Code} step={2} />
<PageButton id="status" label="Migration Status" icon={Zap} step={3} />
</nav>
       {/* Footer Info */}
<div className={`mt-auto pt-4 border-t border-gray-200 ${isSidebarOpen ? 'block' : 'hidden'}`}>
<p className="text-xs font-semibold text-gray-500">Project: {appDetails.appName || 'New'}</p>
<p className="text-xs text-gray-400">User: {userId ? userId.substring(0, 8) + '...' : 'Anonymous'}</p>
<button
               onClick={() => saveConfig()}
               className="mt-2 w-full p-2 text-xs text-indigo-600 bg-indigo-100 rounded-lg hover:bg-indigo-200 font-medium transition"
>
               Manual Save
</button>
</div>
</div>
     {/* --- MAIN CONTENT AREA --- */}
<main className="flex-grow p-4 sm:p-8 overflow-y-auto">
       {/* Notification Toast */}
       {notification.message && (
<div className={`fixed top-4 right-4 z-[100] p-4 rounded-xl shadow-xl flex items-center transition-opacity duration-300 ${
           notification.type === 'success' ? 'bg-green-500 text-white' :
           notification.type === 'warning' ? 'bg-yellow-500 text-gray-800' :
           'bg-red-500 text-white'
         }`}>
<Bell size={20} className="mr-2" />
<p className="font-semibold">{notification.message}</p>
</div>
       )}
       {/* Render Active Page */}
       {currentPage === 'details' && <AppDetailsPage />}
       {currentPage === 'architecture' && <ArchitecturePlanner />}
       {currentPage === 'status' && <StatusDashboard />}
</main>
</div>
 );
};
export default App;