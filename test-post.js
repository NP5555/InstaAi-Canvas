require('dotenv').config();
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { IgApiClient } = require('instagram-private-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuration from environment variables
const config = {
  instagram: {
    username: process.env.INSTAGRAM_USERNAME,
    password: process.env.INSTAGRAM_PASSWORD
  },
  personImage: process.env.PERSON_IMAGE_PATH,
  geminiApiKey: process.env.GEMINI_API_KEY
};

// Initialize Gemini
const genAI = new GoogleGenerativeAI(config.geminiApiKey);

// Test topics for quotes
const topics = [
  'success',
  'motivation',
  'leadership',
  'growth',
  'entrepreneurship',
  'mindset',
  'inspiration',
  'achievement'
];

// Generate quote based on topic
async function generateQuote(topic) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 256,
      }
    });
    
    const prompt = `Generate a motivational quote about ${topic} in JSON format:
{
  "content": "<quote>",
  "author": "<author>"
}
Rules:
- Quote must be under 100 characters
- Focus on ${topic}
- Author must be well-known
- Do not include quotation marks in the quote
- Response must be valid JSON only`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();
    
    try {
      const cleanText = text.replace(/^```json\n|\n```$/g, '').trim();
      const quote = JSON.parse(cleanText);
      
      // Clean up the quote text by removing any quotation marks
      quote.content = quote.content
        .replace(/^["']|["']$/g, '') // Remove quotes at start/end
        .replace(/["""'']/g, '')     // Remove any other quote characters
        .trim();
      
      console.log('Successfully generated quote:', quote);
      return quote;
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      throw parseError;
    }
  } catch (error) {
    console.error('Error generating quote:', error);
    throw error;
  }
}

// Create image with quote
async function createQuoteImage(quote, topic) {
  const width = 1080;
  const height = 1350;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Create black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  
  // Add subtle luxury pattern
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.1)'; // Very subtle gold
  ctx.lineWidth = 2;
  
  // Create diagonal pattern
  for (let i = -height; i < width + height; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }
  
  // Add decorative corners
  const cornerSize = 100;
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)'; // Semi-transparent gold
  ctx.lineWidth = 3;
  
  // Top left corner
  ctx.beginPath();
  ctx.moveTo(50, 50);
  ctx.lineTo(50 + cornerSize, 50);
  ctx.moveTo(50, 50);
  ctx.lineTo(50, 50 + cornerSize);
  ctx.stroke();
  
  // Top right corner
  ctx.beginPath();
  ctx.moveTo(width - 50, 50);
  ctx.lineTo(width - 50 - cornerSize, 50);
  ctx.moveTo(width - 50, 50);
  ctx.lineTo(width - 50, 50 + cornerSize);
  ctx.stroke();
  
  // Bottom left corner
  ctx.beginPath();
  ctx.moveTo(50, height - 50);
  ctx.lineTo(50 + cornerSize, height - 50);
  ctx.moveTo(50, height - 50);
  ctx.lineTo(50, height - 50 - cornerSize);
  ctx.stroke();
  
  // Bottom right corner
  ctx.beginPath();
  ctx.moveTo(width - 50, height - 50);
  ctx.lineTo(width - 50 - cornerSize, height - 50);
  ctx.moveTo(width - 50, height - 50);
  ctx.lineTo(width - 50, height - 50 - cornerSize);
  ctx.stroke();
  
  // Configure text styles for quote
  const maxLineWidth = width * 0.85;
  const lineHeight = 85;
  const fontSize = 72; // Slightly larger for better impact
  const authorFontSize = 40; // Slightly larger for better proportion

  // Create gold gradient for text
  const textGradient = ctx.createLinearGradient(0, 0, width, 0);
  textGradient.addColorStop(0, '#BF953F');
  textGradient.addColorStop(0.5, '#FCF6BA');
  textGradient.addColorStop(1, '#B38728');

  // Add quote text with enhanced styling
  ctx.textAlign = 'center';
  ctx.fillStyle = textGradient;
  
  // Use modern, bold font stack for main quote
  ctx.font = `bold ${fontSize}px "Roboto Condensed", "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
  
  // Split quote into multiple lines
  const words = quote.content
    .replace(/^["']|["']$/g, '') // Remove any quotes at start/end
    .replace(/["""'']/g, '')     // Remove any other quote characters
    .split(' ');
  let line = '';
  let yPosition = height * 0.4;
  
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxLineWidth && i > 0) {
      ctx.fillText(line, width / 2, yPosition);
      line = words[i] + ' ';
      yPosition += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, width / 2, yPosition);
  
  // Add decorative line
  yPosition += lineHeight * 0.5;
  ctx.strokeStyle = textGradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.3, yPosition);
  ctx.lineTo(width * 0.7, yPosition);
  ctx.stroke();
  
  // Add author with modern styling
  yPosition += lineHeight * 0.8;
  // Use slightly different font stack for author name
  ctx.font = `500 italic ${authorFontSize}px "Roboto", "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(212, 175, 55, 0.8)'; // Slightly transparent gold
  ctx.fillText(quote.author, width / 2, yPosition);
  
  // Add hashtag with modern sans-serif
  yPosition = height - 100;
  ctx.font = `600 28px "Roboto", "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(212, 175, 55, 0.5)'; // More transparent gold
  ctx.fillText('#' + topic.toLowerCase(), width / 2, yPosition);
  
  // Add watermark/branding with clean, modern font
  ctx.font = `400 24px "Roboto Condensed", "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(212, 175, 55, 0.3)'; // Even more transparent gold
  ctx.fillText('@agentic.insta', width / 2, height - 40);
  
  // Save image
  const outputPath = 'test_post.jpg';
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createJPEGStream({ quality: 0.95 });
  stream.pipe(out);
  
  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve(outputPath));
    out.on('error', reject);
  });
}

// Post to Instagram
async function postToInstagram(imagePath, caption) {
  const ig = new IgApiClient();
  ig.state.generateDevice(config.instagram.username);
  
  try {
    console.log('Logging in to Instagram...');
    await ig.simulate.preLoginFlow();
    await ig.account.login(config.instagram.username, config.instagram.password);
    
    console.log('Uploading image...');
    const publishResult = await ig.publish.photo({
      file: fs.readFileSync(imagePath),
      caption: caption
    });
    
    console.log('Successfully posted to Instagram!');
    return publishResult;
  } catch (error) {
    console.error('Error posting to Instagram:', error);
    throw error;
  }
}

// Main test function
async function testPost() {
  try {
    // Select random topic
    const topic = topics[Math.floor(Math.random() * topics.length)];
    console.log('Selected topic:', topic);
    
    // Generate quote
    const quote = await generateQuote(topic);
    
    // Create image
    const imagePath = await createQuoteImage(quote, topic);
    console.log('Created image:', imagePath);
    
    // Prepare caption with hashtags
    const hashtags = [
      `#${topic}`,
      '#motivation',
      '#inspiration',
      '#quotes',
      '#success',
      '#mindset',
      '#growth',
      '#wisdom'
    ].join(' ');
    
    const caption = `${quote.content}\n\n— ${quote.author}\n\n${hashtags}`;
    
    // Post to Instagram
    await postToInstagram(imagePath, caption);
    
    // Clean up
    fs.unlinkSync(imagePath);
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
console.log('Starting test post...');
testPost(); 