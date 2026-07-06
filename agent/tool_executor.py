import json
import re

def execute_tool(output, tools, attachments=None):
    try:
        # LLMs often add text around JSON, so we use regex to extract the JSON block
        match = re.search(r'\{.*\}', output, re.DOTALL)
        if not match:
            return None # No JSON found, meaning no tool request

        json_str = match.group(0)
        data = json.loads(json_str)

        tool_name = data.get("tool")
        arguments = data.get("arguments", {})

        # LLMs sometimes return arguments as a nested JSON string instead of an object.
        if isinstance(arguments, str):
            arguments = json.loads(arguments)

        if not tool_name:
            return None

        print(f"Tool requested : {tool_name}")
        if tool_name in tools:
            print(f"Tool called : {tool_name}")
            if tool_name == "sendEmail":
                # Always inject the real temp-file paths from the server.
                # Ignore whatever filename the LLM may have hallucinated.
                arguments["attachments"] = attachments if attachments else []
            tool_res =  tools[tool_name]["function"](**arguments)
            print(f"tool : {tool_name} executed successfully")
            return tool_res
        else:
            return "Unknown tool request check tool registry"

    except Exception as e:
        print(f"EXCEPTION CATCHED :{e} ")
        print(f"Arguments passed : {arguments}")
        # Failing silently if no strict JSON found instead of huge tracebacks on user chats.
        return None