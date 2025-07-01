#!/usr/bin/env python3
"""
Interface Data Formatter for JSNAPy Results
Formats get-interface-information RPC call data into various output formats
Author: nikos-geranios_vgi
"""

import json
import xml.etree.ElementTree as ET
from typing import Dict, List, Any, Optional
from tabulate import tabulate
from datetime import datetime
import csv
import io

class InterfaceDataFormatter:
    """Format interface data from JSNAPy/PyEZ RPC calls"""
    
    def __init__(self):
        self.supported_formats = ['table', 'json', 'csv', 'xml', 'summary', 'detailed']
    
    def format_interface_data(self, rpc_response, format_type: str = 'table', 
                            filter_criteria: Dict[str, Any] = None) -> str:
        """
        Main method to format interface data
        
        Args:
            rpc_response: Raw RPC response (XML element or dict)
            format_type: Output format ('table', 'json', 'csv', 'xml', 'summary', 'detailed')
            filter_criteria: Optional filtering criteria
        
        Returns:
            Formatted string output
        """
        # Parse the RPC response into structured data
        interfaces = self._parse_interface_response(rpc_response)
        
        # Apply filters if specified
        if filter_criteria:
            interfaces = self._apply_filters(interfaces, filter_criteria)
        
        # Format based on requested type
        if format_type == 'table':
            return self._format_as_table(interfaces)
        elif format_type == 'json':
            return self._format_as_json(interfaces)
        elif format_type == 'csv':
            return self._format_as_csv(interfaces)
        elif format_type == 'xml':
            return self._format_as_xml(interfaces)
        elif format_type == 'summary':
            return self._format_as_summary(interfaces)
        elif format_type == 'detailed':
            return self._format_as_detailed(interfaces)
        else:
            raise ValueError(f"Unsupported format: {format_type}")
    
    def _parse_interface_response(self, rpc_response) -> List[Dict[str, Any]]:
        """Parse RPC response into list of interface dictionaries"""
        interfaces = []
        
        # Handle XML ElementTree response
        if hasattr(rpc_response, 'findall'):
            for interface in rpc_response.findall('.//physical-interface'):
                interface_data = {
                    'name': self._get_text(interface, 'name'),
                    'admin_status': self._get_text(interface, 'admin-status'),
                    'oper_status': self._get_text(interface, 'oper-status'),
                    'description': self._get_text(interface, 'description'),
                    'mtu': self._get_text(interface, 'mtu'),
                    'speed': self._get_text(interface, 'speed'),
                    'link_level_type': self._get_text(interface, 'link-level-type'),
                    'physical_link': self._get_text(interface, 'physical-link'),
                    'if_type': self._get_text(interface, 'if-type'),
                    'snmp_index': self._get_text(interface, 'snmp-index'),
                    'if_media_type': self._get_text(interface, 'if-media-type'),
                    'current_physical_address': self._get_text(interface, 'current-physical-address'),
                    'hardware_physical_address': self._get_text(interface, 'hardware-physical-address'),
                    'statistics': self._parse_interface_statistics(interface),
                    'logical_interfaces': self._parse_logical_interfaces(interface)
                }
                interfaces.append(interface_data)
        
        # Handle dictionary response (already parsed)
        elif isinstance(rpc_response, dict):
            if 'interface-information' in rpc_response:
                physical_interfaces = rpc_response['interface-information'].get('physical-interface', [])
                if not isinstance(physical_interfaces, list):
                    physical_interfaces = [physical_interfaces]
                
                for interface in physical_interfaces:
                    interfaces.append(self._normalize_dict_interface(interface))
        
        return interfaces
    
    def _get_text(self, element, tag: str) -> str:
        """Safely extract text from XML element"""
        child = element.find(tag)
        return child.text if child is not None and child.text else ''
    
    def _parse_interface_statistics(self, interface_element) -> Dict[str, str]:
        """Parse interface statistics from XML"""
        stats = {}
        traffic_stats = interface_element.find('traffic-statistics')
        if traffic_stats is not None:
            stats.update({
                'input_bytes': self._get_text(traffic_stats, 'input-bytes'),
                'input_packets': self._get_text(traffic_stats, 'input-packets'),
                'output_bytes': self._get_text(traffic_stats, 'output-bytes'),
                'output_packets': self._get_text(traffic_stats, 'output-packets'),
                'input_errors': self._get_text(traffic_stats, 'input-errors'),
                'output_errors': self._get_text(traffic_stats, 'output-errors')
            })
        return stats
    
    def _parse_logical_interfaces(self, interface_element) -> List[Dict[str, Any]]:
        """Parse logical interfaces"""
        logical_interfaces = []
        for logical in interface_element.findall('logical-interface'):
            logical_data = {
                'name': self._get_text(logical, 'name'),
                'admin_status': self._get_text(logical, 'admin-status'),
                'oper_status': self._get_text(logical, 'oper-status'),
                'filter_information': self._get_text(logical, 'filter-information'),
                'address_family': self._parse_address_family(logical)
            }
            logical_interfaces.append(logical_data)
        return logical_interfaces
    
    def _parse_address_family(self, logical_element) -> List[Dict[str, Any]]:
        """Parse address family information"""
        families = []
        for family in logical_element.findall('address-family'):
            family_data = {
                'name': self._get_text(family, 'address-family-name'),
                'addresses': []
            }
            for addr in family.findall('interface-address'):
                addr_data = {
                    'name': self._get_text(addr, 'ifa-local'),
                    'destination': self._get_text(addr, 'ifa-destination'),
                    'broadcast': self._get_text(addr, 'ifa-broadcast')
                }
                family_data['addresses'].append(addr_data)
            families.append(family_data)
        return families
    
    def _normalize_dict_interface(self, interface_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize dictionary-based interface data"""
        return {
            'name': interface_dict.get('name', ''),
            'admin_status': interface_dict.get('admin-status', ''),
            'oper_status': interface_dict.get('oper-status', ''),
            'description': interface_dict.get('description', ''),
            'mtu': str(interface_dict.get('mtu', '')),
            'speed': interface_dict.get('speed', ''),
            'link_level_type': interface_dict.get('link-level-type', ''),
            'physical_link': interface_dict.get('physical-link', ''),
            'if_type': interface_dict.get('if-type', ''),
            'snmp_index': str(interface_dict.get('snmp-index', '')),
            'if_media_type': interface_dict.get('if-media-type', ''),
            'current_physical_address': interface_dict.get('current-physical-address', ''),
            'hardware_physical_address': interface_dict.get('hardware-physical-address', ''),
            'statistics': interface_dict.get('traffic-statistics', {}),
            'logical_interfaces': interface_dict.get('logical-interface', [])
        }
    
    def _apply_filters(self, interfaces: List[Dict[str, Any]], 
                      filter_criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Apply filtering criteria to interface list"""
        filtered = []
        
        for interface in interfaces:
            include = True
            
            # Filter by admin status
            if 'admin_status' in filter_criteria:
                if interface['admin_status'] != filter_criteria['admin_status']:
                    include = False
            
            # Filter by operational status
            if 'oper_status' in filter_criteria:
                if interface['oper_status'] != filter_criteria['oper_status']:
                    include = False
            
            # Filter by interface name pattern
            if 'name_pattern' in filter_criteria:
                pattern = filter_criteria['name_pattern']
                if pattern not in interface['name']:
                    include = False
            
            # Filter by interface type
            if 'if_type' in filter_criteria:
                if interface['if_type'] != filter_criteria['if_type']:
                    include = False
            
            # Filter by speed
            if 'min_speed' in filter_criteria:
                try:
                    speed = interface['speed'].replace('mbps', '').replace('gbps', '000')
                    if speed and int(speed) < filter_criteria['min_speed']:
                        include = False
                except (ValueError, AttributeError):
                    pass
            
            if include:
                filtered.append(interface)
        
        return filtered
    
    def _format_as_table(self, interfaces: List[Dict[str, Any]]) -> str:
        """Format as ASCII table"""
        if not interfaces:
            return "No interfaces found matching criteria."
        
        headers = ['Interface', 'Admin', 'Oper', 'Description', 'Speed', 'MTU', 'Type']
        rows = []
        
        for interface in interfaces:
            rows.append([
                interface['name'],
                interface['admin_status'],
                interface['oper_status'],
                interface['description'][:30] + '...' if len(interface['description']) > 30 else interface['description'],
                interface['speed'],
                interface['mtu'],
                interface['if_type']
            ])
        
        return tabulate(rows, headers=headers, tablefmt='grid')
    
    def _format_as_json(self, interfaces: List[Dict[str, Any]]) -> str:
        """Format as JSON"""
        return json.dumps({
            'interface_count': len(interfaces),
            'timestamp': datetime.now().isoformat(),
            'interfaces': interfaces
        }, indent=2, default=str)
    
    def _format_as_csv(self, interfaces: List[Dict[str, Any]]) -> str:
        """Format as CSV"""
        if not interfaces:
            return "No interfaces found."
        
        output = io.StringIO()
        fieldnames = ['name', 'admin_status', 'oper_status', 'description', 
                     'speed', 'mtu', 'if_type', 'physical_link']
        
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for interface in interfaces:
            row = {field: interface.get(field, '') for field in fieldnames}
            writer.writerow(row)
        
        return output.getvalue()
    
    def _format_as_xml(self, interfaces: List[Dict[str, Any]]) -> str:
        """Format as XML"""
        root = ET.Element('interface-information')
        root.set('timestamp', datetime.now().isoformat())
        
        for interface in interfaces:
            interface_elem = ET.SubElement(root, 'physical-interface')
            
            for key, value in interface.items():
                if key not in ['statistics', 'logical_interfaces'] and value:
                    elem = ET.SubElement(interface_elem, key.replace('_', '-'))
                    elem.text = str(value)
        
        return ET.tostring(root, encoding='unicode')
    
    def _format_as_summary(self, interfaces: List[Dict[str, Any]]) -> str:
        """Format as summary statistics"""
        if not interfaces:
            return "No interfaces found."
        
        total = len(interfaces)
        admin_up = sum(1 for i in interfaces if i['admin_status'] == 'up')
        oper_up = sum(1 for i in interfaces if i['oper_status'] == 'up')
        
        # Interface type breakdown
        type_counts = {}
        for interface in interfaces:
            if_type = interface['if_type']
            type_counts[if_type] = type_counts.get(if_type, 0) + 1
        
        # Speed breakdown
        speed_counts = {}
        for interface in interfaces:
            speed = interface['speed']
            speed_counts[speed] = speed_counts.get(speed, 0) + 1
        
        summary = f"""
Interface Summary Report
========================
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Overview:
  Total Interfaces: {total}
  Admin Up: {admin_up} ({admin_up/total*100:.1f}%)
  Operationally Up: {oper_up} ({oper_up/total*100:.1f}%)
  Admin Down: {total-admin_up}
  Operationally Down: {total-oper_up}

Interface Types:
"""
        for if_type, count in sorted(type_counts.items()):
            summary += f"  {if_type}: {count}\n"
        
        summary += "\nSpeed Distribution:\n"
        for speed, count in sorted(speed_counts.items()):
            if speed:
                summary += f"  {speed}: {count}\n"
        
        return summary
    
    def _format_as_detailed(self, interfaces: List[Dict[str, Any]]) -> str:
        """Format as detailed report"""
        if not interfaces:
            return "No interfaces found."
        
        output = []
        output.append("Detailed Interface Report")
        output.append("=" * 50)
        output.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        output.append("")
        
        for i, interface in enumerate(interfaces, 1):
            output.append(f"Interface {i}: {interface['name']}")
            output.append("-" * 30)
            output.append(f"  Administrative Status: {interface['admin_status']}")
            output.append(f"  Operational Status: {interface['oper_status']}")
            output.append(f"  Description: {interface['description']}")
            output.append(f"  Type: {interface['if_type']}")
            output.append(f"  Speed: {interface['speed']}")
            output.append(f"  MTU: {interface['mtu']}")
            output.append(f"  Physical Link: {interface['physical_link']}")
            output.append(f"  Media Type: {interface['if_media_type']}")
            output.append(f"  MAC Address: {interface['current_physical_address']}")
            
            # Statistics if available
            if interface['statistics']:
                output.append("  Traffic Statistics:")
                for stat_name, stat_value in interface['statistics'].items():
                    if stat_value:
                        output.append(f"    {stat_name}: {stat_value}")
            
            # Logical interfaces if available
            if interface['logical_interfaces']:
                output.append(f"  Logical Interfaces: {len(interface['logical_interfaces'])}")
                for logical in interface['logical_interfaces']:
                    if logical.get('name'):
                        output.append(f"    - {logical['name']} ({logical.get('admin_status', '')}/{logical.get('oper_status', '')})")
            
            output.append("")
        
        return "\n".join(output)


# Example usage and integration with your JSNAPy runner
def integrate_with_jsnapy_runner():
    """Example of how to integrate this formatter with your existing runner"""
    
    # This would be added to your TestExecutor class
    def format_interface_results(self, rpc_response, format_type='table', filters=None):
        """Add this method to your TestExecutor class"""
        formatter = InterfaceDataFormatter()
        return formatter.format_interface_data(rpc_response, format_type, filters)
    
    # Example usage in your test execution
    example_usage = """
    # In your _execute_single_test method, after getting the RPC response:
    
    # Get raw interface data
    with Device(host=hostname, user=username, passwd=password) as dev:
        rpc_response = dev.rpc.get_interface_information()
    
    # Format the data
    formatter = InterfaceDataFormatter()
    
    # As a table
    table_output = formatter.format_interface_data(rpc_response, 'table')
    
    # As JSON
    json_output = formatter.format_interface_data(rpc_response, 'json')
    
    # With filters (only show down interfaces)
    down_interfaces = formatter.format_interface_data(
        rpc_response, 
        'table',
        filter_criteria={'oper_status': 'down'}
    )
    
    # Only Gigabit Ethernet interfaces
    ge_interfaces = formatter.format_interface_data(
        rpc_response,
        'detailed', 
        filter_criteria={'name_pattern': 'ge-'}
    )
    """
    
    return example_usage


if __name__ == "__main__":
    # Example with mock data
    mock_interfaces = [
        {
            'name': 'ge-0/0/0',
            'admin_status': 'up',
            'oper_status': 'up',
            'description': 'Link to Core Router',
            'speed': '1000mbps',
            'mtu': '1514',
            'if_type': 'Ethernet',
            'physical_link': 'up',
            'if_media_type': '1000Base-T',
            'current_physical_address': '00:1b:c0:a8:01:01',
            'hardware_physical_address': '00:1b:c0:a8:01:01',
            'statistics': {
                'input_bytes': '1234567890',
                'output_bytes': '987654321',
                'input_packets': '12345',
                'output_packets': '9876'
            },
            'logical_interfaces': []
        },
        {
            'name': 'ge-0/0/1',
            'admin_status': 'up',
            'oper_status': 'down',
            'description': 'Backup Link',
            'speed': '1000mbps',
            'mtu': '1514',
            'if_type': 'Ethernet',
            'physical_link': 'down',
            'if_media_type': '1000Base-T',
            'current_physical_address': '00:1b:c0:a8:01:02',
            'hardware_physical_address': '00:1b:c0:a8:01:02',
            'statistics': {},
            'logical_interfaces': []
        }
    ]
    
    formatter = InterfaceDataFormatter()
    
    print("=== TABLE FORMAT ===")
    print(formatter._format_as_table(mock_interfaces))
    
    print("\n=== SUMMARY FORMAT ===")
    print(formatter._format_as_summary(mock_interfaces))
    
    print("\n=== JSON FORMAT ===")
    print(formatter._format_as_json(mock_interfaces))
