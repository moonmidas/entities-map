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
    const { prompt } = req.body;
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-05-13',
      messages: [
        { role: 'system', content: `
            <INSTRUCTIONS> 
            Generate a list of 5-10 entities that are related to the given topic.
            Do not use markdown.
            </INSTRUCTIONS>
            <FORMAT>
            [ENTITY 1]
            [ENTITY 2]
            [ENTITY 3]
            ...
            </FORMAT>
            ` },
        { role: 'user', content: `<TOPIC> ${prompt} </TOPIC>` }
      ],
      max_tokens: 150
    });
    console.log(response.choices[0].message.content.trim());
    res.json({ result: response.choices[0].message.content.trim() });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while querying the LLM.' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));