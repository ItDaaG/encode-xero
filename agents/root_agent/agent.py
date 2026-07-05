from google.adk.agents.llm_agent import Agent
from reporter_agent.reporter_agent import reporter_agent

from tools.users import get_users

root_agent = Agent(
    model='gemini-3.5-flash',
    name='root_agent',
    description='A helpful assistant for user questions.',
    instruction=(
        'Answer user questions to the best of your knowledge. '
        'When asked about users, registrations, or who is signed up, call the get_users tool. '
        'When asked to generate or deliver financial reports, transfer to reporter_agent.'
    ),
    tools=[get_users],
    sub_agents=[reporter_agent],
)
