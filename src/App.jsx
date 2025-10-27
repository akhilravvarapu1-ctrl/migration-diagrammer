import { Zap, Server, Code } from 'lucide-react';
function App() {
 return (
   // Responsive container for the entire app
<div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
     {/* Main Card */}
<div className="w-full max-w-lg bg-white shadow-2xl rounded-xl p-8 space-y-6 border border-indigo-100">
<div className="flex items-center space-x-4">
<Zap className="w-8 h-8 text-indigo-600 animate-pulse" />
<h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
           Deployment Test Success!
</h1>
</div>
       {/* Status Section */}
<div className="space-y-4 pt-2">
<p className="text-lg text-gray-700">
           This page is running on the cloud, which means your Tailwind setup is working!
</p>
<div className="flex flex-col space-y-3">
<FeatureItem
             icon={<Server className="w-5 h-5 text-green-500" />}
             text="Dependencies (Firebase, Lucide) were installed successfully."
           />
<FeatureItem
             icon={<Code className="w-5 h-5 text-indigo-500" />}
             text="Tailwind CSS and PostCSS configuration files are detected."
           />
</div>
<p className="pt-4 text-sm text-gray-500">
           You can now safely proceed with the development of the Migration Diagrammer app.
</p>
</div>
       {/* Button to confirm success */}
<button
         className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition duration-200 shadow-md hover:shadow-lg transform hover:scale-[1.01]"
>
         Start Building the Diagrammer
</button>
</div>
</div>
 );
}
// Helper component for cleaner UI
const FeatureItem = ({ icon, text }) => (
<div className="flex items-start space-x-3 bg-gray-50 p-3 rounded-lg">
<span className="flex-shrink-0 pt-1">{icon}</span>
<p className="text-sm text-gray-800">{text}</p>
</div>
);
export default App;