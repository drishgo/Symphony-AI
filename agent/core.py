from tools.registry import tools
from agent.llm import LLMClient
from agent.prompt_builder import build_tool_prompt
from agent.tool_executor import execute_tool
from agent.memory import ConversationMemory
class Agent:
    def __init__(self):
        self.tools = tools
        self.system_prompt = build_tool_prompt(tools=self.tools)
        self.client = LLMClient()
        self.memory = ConversationMemory(self.system_prompt)
    
    def run(self,user_input,attachments=None):
        self.memory.add("user",user_input)

        output = self.client.generate(self.memory.get())

        self.memory.add("assistant",output)
        
        tool_result = execute_tool(output,self.tools,attachments)
        
        if tool_result is not None:
            tool_message = f"this is the output of the tool: {tool_result}, process and structure it in a beautiful way"
            self.memory.add("user", tool_message)
            tool_response = self.client.generate(self.memory.get())
            self.memory.add("assistant", tool_response or "")
            return tool_response if tool_response is not None else "Tool execution completed, but I encountered an error formulating a response."

        return output if output is not None else "I encountered an error understanding that request."
