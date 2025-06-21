const labsData = {
  routing: [
    {
      id: 'ospf-lab',
      slug: 'ospf-lab',
      title: 'OSPF Advanced Configuration',
      difficulty: 'Advanced',
      duration: '120 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'Advanced OSPF configuration with multiple areas and authentication'
    },
    {
      id: 'bgp-enterprise',
      slug: 'bgp-enterprise',
      title: 'BGP Enterprise Setup',
      difficulty: 'Expert',
      duration: '180 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'Enterprise BGP configuration with route policies and filtering'
    },
    {
      id: 'mpls-vpn',
      slug: 'mpls-vpn',
      title: 'MPLS VPN Implementation',
      difficulty: 'Expert',
      duration: '240 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'MPLS L3VPN configuration with CE-PE connectivity'
    }
  ],
  switching: [
    {
      id: 'vlan-trunking',
      slug: 'vlan-trunking',
      title: 'Advanced VLAN Trunking',
      difficulty: 'Intermediate',
      duration: '90 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'Complex VLAN scenarios with multiple trunk links'
    },
    {
      id: 'spanning-tree',
      slug: 'spanning-tree',
      title: 'Spanning Tree Optimization',
      difficulty: 'Advanced',
      duration: '135 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'STP variants and optimization techniques'
    }
  ],
  security: [
    {
      id: 'firewall-policies',
      slug: 'firewall-policies',
      title: 'Advanced Firewall Policies',
      difficulty: 'Advanced',
      duration: '150 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'Complex firewall rule sets and policy optimization'
    },
    {
      id: 'vpn-ipsec',
      slug: 'vpn-ipsec',
      title: 'IPSec VPN Configuration',
      difficulty: 'Advanced',
      duration: '180 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'Site-to-site and remote access VPN setup'
    }
  ],
  automation: [
    {
      id: 'ansible-network',
      slug: 'ansible-network',
      title: 'Network Automation with Ansible',
      difficulty: 'Intermediate',
      duration: '120 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'Automate network configuration using Ansible playbooks'
    },
    {
      id: 'python-netmiko',
      slug: 'python-netmiko',
      title: 'Python Network Scripts',
      difficulty: 'Advanced',
      duration: '160 min',
      thumbnail: '/api/placeholder/300/200',
      description: 'Network automation using Python and Netmiko'
    }
  ]
};

export default labsData;
