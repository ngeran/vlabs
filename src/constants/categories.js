import { Network, Router, Shield, Cog } from 'lucide-react';

const categories = [
  { id: 'all', name: 'All Labs', icon: Network, color: 'bg-blue-500' },
  { id: 'routing', name: 'Routing', icon: Router, color: 'bg-green-500' },
  { id: 'switching', name: 'Switching', icon: Network, color: 'bg-purple-500' },
  { id: 'security', name: 'Security', icon: Shield, color: 'bg-red-500' },
  { id: 'automation', name: 'Automation', icon: Cog, color: 'bg-orange-500' }
];

export default categories;
