#!/usr/bin/env python3
"""
Template Rendering Utility for Juniper Configuration Templates
This script uses Jinja2 to render configuration templates with provided parameters.
"""

import json
import sys
from jinja2 import Environment, BaseLoader, TemplateError
from jinja2.exceptions import TemplateNotFound, TemplateSyntaxError, UndefinedError

class StringTemplateLoader(BaseLoader):
    """Custom Jinja2 loader that loads templates from strings."""
    
    def __init__(self, template_string):
        self.template_string = template_string
    
    def get_source(self, environment, template):
        return self.template_string, None, lambda: True

def render_template(template_content, parameters):
    """
    Render a Jinja2 template with the provided parameters.
    
    Args:
        template_content (str): The Jinja2 template content
        parameters (dict): Parameters to pass to the template
    
    Returns:
        dict: Result containing rendered config or error information
    """
    try:
        # Create Jinja2 environment with custom loader
        env = Environment(
            loader=StringTemplateLoader(template_content),
            trim_blocks=True,
            lstrip_blocks=True,
            keep_trailing_newline=True
        )
        
        # Add custom filters if needed
        env.filters['upper'] = str.upper
        env.filters['lower'] = str.lower
        
        # Load and render template
        template = env.get_template('')
        rendered_config = template.render(**parameters)
        
        return {
            "success": True,
            "rendered_config": rendered_config,
            "error": None
        }
        
    except TemplateSyntaxError as e:
        return {
            "success": False,
            "rendered_config": None,
            "error": f"Template syntax error: {str(e)}"
        }
    except UndefinedError as e:
        return {
            "success": False,
            "rendered_config": None,
            "error": f"Undefined variable in template: {str(e)}"
        }
    except TemplateError as e:
        return {
            "success": False,
            "rendered_config": None,
            "error": f"Template rendering error: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "rendered_config": None,
            "error": f"Unexpected error: {str(e)}"
        }

def main():
    """Main function to handle input and output."""
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        template_content = input_data.get('template_content', '')
        parameters = input_data.get('parameters', {})
        template_id = input_data.get('template_id', 'unknown')
        
        if not template_content:
            result = {
                "success": False,
                "rendered_config": None,
                "error": "No template content provided"
            }
        else:
            # Render the template
            result = render_template(template_content, parameters)
        
        # Add metadata
        result['template_id'] = template_id
        result['parameters_used'] = parameters
        
        # Output result as JSON
        print(json.dumps(result, indent=2))
        
    except json.JSONDecodeError as e:
        error_result = {
            "success": False,
            "rendered_config": None,
            "error": f"Invalid JSON input: {str(e)}"
        }
        print(json.dumps(error_result, indent=2))
    except Exception as e:
        error_result = {
            "success": False,
            "rendered_config": None,
            "error": f"Script error: {str(e)}"
        }
        print(json.dumps(error_result, indent=2))

if __name__ == "__main__":
    main()
