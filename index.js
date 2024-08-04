const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
dotenv.config();


const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/query-llm', async (req, res) => {
    try {
      const { prompt, existingNodes, parentNode } = req.body;
      console.log("Prompt:", prompt)
      console.log("Existing Nodes:", existingNodes)
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-2024-05-13',
        messages: [
          { role: 'system', content: `
              <INSTRUCTIONS> 
              Generate a list of 5-10 entities that are related to the given topic.
              Consider the existing nodes provided and their potential relationships to the new entities, 
              but exclude the direct parent node from these relationships.
              For each entity, provide a strength value between 0 and 1 indicating how strongly it's related to the topic.
              If the entity is related to any existing nodes (except the parent), list those relationships.
              Do not use markdown.
              </INSTRUCTIONS>
              <FORMAT>
              [ENTITY 1]|[STRENGTH 1]|[RELATED_NODE_1:STRENGTH,RELATED_NODE_2:STRENGTH,...]
              [ENTITY 2]|[STRENGTH 2]|[RELATED_NODE_1:STRENGTH,RELATED_NODE_2:STRENGTH,...]
              [ENTITY 3]|[STRENGTH 3]|[RELATED_NODE_1:STRENGTH,RELATED_NODE_2:STRENGTH,...]
              ...
              </FORMAT>
              ` },
          { role: 'user', content: `<TOPIC>${prompt}</TOPIC><EXISTING_NODES>${existingNodes.join(',')}</EXISTING_NODES><PARENT_NODE>${parentNode}</PARENT_NODE>` }
        ],
        max_tokens: 250
      });
      console.log(response.choices[0].message.content.trim());
      res.json({ result: response.choices[0].message.content.trim() });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'An error occurred while querying the LLM.' });
    }
  });

app.listen(3000, () => console.log('Server running on port 3000'));