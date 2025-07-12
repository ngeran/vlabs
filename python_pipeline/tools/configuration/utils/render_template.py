# python_pipeline/tools/configuration/utils/render_template.py

import argparse
import json
# --- We no longer need StrictUndefined, so it's removed from the import ---
from jinja2 import Environment, exceptions

def main():
    """
    Renders a Jinja2 template based on command-line arguments and
    prints a structured JSON object to stdout.
    """
    parser = argparse.ArgumentParser(description="Render a Jinja2 template.")
    parser.add_argument(
        "--template-content",
        required=True,
        help="The raw Jinja2 template content as a string."
    )
    parser.add_argument(
        "--parameters",
        required=True,
        help="A JSON string representing the parameters for the template."
    )
    args = parser.parse_args()

    try:
        parameters = json.loads(args.parameters)

        # --- ✨✨✨ THE FIX ✨✨✨ ---
        # We REMOVE the `undefined=StrictUndefined` line.
        # This reverts to the default, lenient behavior where missing
        # variables are rendered as empty strings.
        env = Environment(
            trim_blocks=True,
            lstrip_blocks=True
        )
        template = env.from_string(args.template_content)

        # Render the configuration. This will now succeed even with missing optional vars.
        rendered_config = template.render(parameters)

        result = {
            "success": True,
            "rendered_config": rendered_config
        }
        print(json.dumps(result))

    except json.JSONDecodeError:
        error_result = {"success": False, "error": "Invalid JSON format for --parameters argument."}
        print(json.dumps(error_result))

    except exceptions.TemplateError as e:
        # This will now only catch more serious syntax errors in the template itself,
        # not undefined variable errors.
        error_result = {"success": False, "error": f"Template syntax error: {str(e)}"}
        print(json.dumps(error_result))

    except Exception as e:
        error_message = f"An unexpected error occurred: {type(e).__name__} - {str(e)}"
        error_result = {"success": False, "error": error_message}
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()
