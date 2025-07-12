# =================================================================================================
#
# FILE: render_template.py
#
# ROLE: A command-line utility for rendering Jinja2 templates.
#
# DESCRIPTION: This script serves as a core component of the Python backend. It is designed
#              to be called from another process (like a Node.js server) and receives two
#              main inputs via command-line arguments: the raw text of a Jinja2 template and
#              a JSON string of parameters. It renders the template and prints a structured
#              JSON object to standard output, indicating either success (with the rendered
#              content) or failure (with a descriptive error message).
#
# =================================================================================================

# =================================================================================================
# SECTION 1: IMPORTS AND DEPENDENCIES
# =================================================================================================

import argparse
import json
# `jinja2` is the powerful templating engine used to generate the configuration.
from jinja2 import Environment, exceptions

# =================================================================================================
# SECTION 2: MAIN EXECUTION FUNCTION
# =================================================================================================

def main():
    """
    Main function that orchestrates the entire rendering process.
    It parses arguments, renders the template, and handles all potential errors.
    """

    # ---------------------------------------------------------------------------------------------
    # Subsection 2.1: Command-Line Argument Parsing
    # ---------------------------------------------------------------------------------------------
    # `argparse` is used to define and parse the arguments that this script expects when it is
    # called. This makes the script a reusable and well-defined command-line tool.
    parser = argparse.ArgumentParser(description="Render a Jinja2 template.")

    # Argument for the raw template content. It's required for the script to do anything.
    parser.add_argument(
        "--template-content",
        required=True,
        help="The raw Jinja2 template content as a string."
    )

    # Argument for the variables to be used in the template, passed as a JSON string.
    parser.add_argument(
        "--parameters",
        required=True,
        help="A JSON string representing the parameters for the template."
    )
    args = parser.parse_args()

    # ---------------------------------------------------------------------------------------------
    # Subsection 2.2: Template Rendering and Error Handling
    # ---------------------------------------------------------------------------------------------
    # A `try...except` block is used to gracefully handle potential failures during the process,
    # such as invalid JSON, errors in the template syntax, or other unexpected issues.
    try:
        # Attempt to parse the JSON string provided in the --parameters argument.
        # This converts the string into a Python dictionary.
        parameters = json.loads(args.parameters)

        # --- ✨✨✨ THE FIX: CONFIGURE THE JINJA2 ENVIRONMENT ✨✨✨ ---
        # The key change is REMOVING `undefined=StrictUndefined`.
        # By not specifying an `undefined` handler, Jinja2 reverts to its default,
        # lenient behavior. This means that if a template variable is used but
        # not provided in the `parameters` dictionary (e.g., for an optional
        # feature), it will be rendered as an empty string instead of causing
        # the script to crash. This is crucial for supporting templates with
        # optional parameters.
        env = Environment(
            trim_blocks=True,      # Removes the first newline after a block tag.
            lstrip_blocks=True     # Strips leading whitespace from a block.
        )
        # Load the template directly from the string provided in the command-line arguments.
        template = env.from_string(args.template_content)

        # Render the configuration by passing the parameters dictionary to the template.
        # This step will now succeed even if some optional variables are missing.
        rendered_config = template.render(parameters)

        # If rendering is successful, create a success result object.
        result = {
            "success": True,
            "rendered_config": rendered_config
        }
        # Print the success object as a JSON string to standard output.
        # This is how the script communicates the result back to the calling process.
        print(json.dumps(result))

    # ---------------------------------------------------------------------------------------------
    # Subsection 2.3: Specific Exception Handling
    # ---------------------------------------------------------------------------------------------
    # Catch errors that occur if the --parameters argument contains malformed JSON.
    except json.JSONDecodeError:
        error_result = {
            "success": False,
            "error": "Invalid JSON format for --parameters argument."
        }
        print(json.dumps(error_result))

    # Catch errors related to the Jinja2 template itself, such as syntax errors
    # (e.g., an unclosed `{% if %}` tag). This will no longer catch undefined
    # variable errors due to the fix above.
    except exceptions.TemplateError as e:
        error_result = {
            "success": False,
            "error": f"Template syntax error: {str(e)}"
        }
        print(json.dumps(error_result))

    # A general catch-all for any other unexpected errors during execution.
    except Exception as e:
        error_message = f"An unexpected error occurred: {type(e).__name__} - {str(e)}"
        error_result = {
            "success": False,
            "error": error_message
        }
        print(json.dumps(error_result))

# =================================================================================================
# SECTION 3: SCRIPT ENTRY POINT
# =================================================================================================

# This is a standard Python construct. The code inside this `if` block will only run
# when the script is executed directly from the command line (e.g., `python render_template.py ...`).
# It will not run if this script is imported as a module into another Python file.
if __name__ == "__main__":
    main()
