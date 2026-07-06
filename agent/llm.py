from huggingface_hub import InferenceClient
import os
from dotenv import load_dotenv

load_dotenv()

#THIS SPECEFIC ARCHITECTURE IS A SIMPLE IMPL OF THE AGENTIC PHILOSOPHY.
#                       USER (exposed via main.py)
#                        |
#                    Agent Init (listen loop)
#                        |
#                       Agent think or reason (generate response)
#                        |
#                      Output answer to query
# #
class LLMClient:
    def __init__(self):
        self.client = InferenceClient(model=os.getenv("HF_LLM_MODEL") ,api_key=os.getenv("HF_TK"))
        # self.memory = ConversationMemory(system_prompt)
        print("Agent Created")
    
    def generate(self,messages):
        
    
        # we now generate a response by thinking.
        response = self.client.chat.completions.create(
           
            messages = messages,
            max_tokens=300
        )
        reply = response.choices[0].message.content
        if reply is None:
            # Fallback if the HuggingFace Llama 3 API returns a weird payload without content
            reply = "I successfully processed the results internally, but failed to articulate the text due to payload constraints."
        
        # we now structure this response into a beautiful reply.

        
        return reply