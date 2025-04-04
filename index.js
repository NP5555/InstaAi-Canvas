require('dotenv').config();
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const { IgApiClient } = require('instagram-private-api');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Safety configurations to avoid Instagram blocks
const safetyConfig = {
  maxDailyPosts: 3,              // Maximum posts per day
  minPostInterval: 4 * 60 * 60,  // Minimum 4 hours between posts
  maxPostInterval: 8 * 60 * 60,  // Maximum 8 hours between posts
  postingWindows: [              // Safe posting time windows (24-hour format)
    { start: 9, end: 11 },       // Morning
    { start: 14, end: 16 },      // Afternoon
    { start: 19, end: 21 }       // Evening
  ],
  dailyPostCount: 0,             // Track posts made today
  lastPostTime: null,            // Track last post timestamp
  resetTime: '00:00'             // When to reset daily post count
};

// Helper function to check if we can post
function canPostNow() {
  const now = new Date();
  
  // Reset daily post count if it's a new day
  if (safetyConfig.resetTime === now.getHours() + ':' + now.getMinutes()) {
    safetyConfig.dailyPostCount = 0;
  }
  
  // Check if we've exceeded daily post limit
  if (safetyConfig.dailyPostCount >= safetyConfig.maxDailyPosts) {
    console.log('Daily post limit reached');
    return false;
  }
  
  // Check if enough time has passed since last post
  if (safetyConfig.lastPostTime) {
    const timeSinceLastPost = (now - safetyConfig.lastPostTime) / 1000; // in seconds
    if (timeSinceLastPost < safetyConfig.minPostInterval) {
      console.log('Minimum post interval not reached');
      return false;
    }
  }
  
  // Check if current time is within posting windows
  const currentHour = now.getHours();
  const isInPostingWindow = safetyConfig.postingWindows.some(window => 
    currentHour >= window.start && currentHour < window.end
  );
  
  if (!isInPostingWindow) {
    console.log('Outside of safe posting windows');
    return false;
  }
  
  return true;
}

// Helper function to get random delay
function getRandomDelay() {
  return Math.floor(
    Math.random() * 
    (safetyConfig.maxPostInterval - safetyConfig.minPostInterval) * 1000 + 
    safetyConfig.minPostInterval * 1000
  );
}

// Helper function to randomize hashtags
function getRandomHashtags() {
  const allHashtags = [
    'motivation', 'success', 'inspiration', 'quotes', 'mindset', 
    'growth', 'positivity', 'wisdom', 'goals', 'entrepreneur',
    'leadership', 'business', 'personaldevelopment', 'successquotes',
    'motivationalquotes', 'inspirationalquotes', 'quoteoftheday'
  ];
  
  // Shuffle and take random 5-8 hashtags
  return allHashtags
    .sort(() => 0.5 - Math.random())
    .slice(0, Math.floor(Math.random() * 4) + 5)
    .map(tag => '#' + tag)
    .join(' ');
}

// Configuration from environment variables
const config = {
  instagram: {
    username: process.env.INSTAGRAM_USERNAME,
    password: process.env.INSTAGRAM_PASSWORD
  },
  personImage: process.env.PERSON_IMAGE_PATH,
  cronSchedule: process.env.CRON_SCHEDULE,
  geminiApiKey: process.env.GEMINI_API_KEY
};

// Fallback quotes for when API fails
const fallbackQuotes = [
  { content: "Every moment is a fresh beginning.", author: "T.S. Eliot" },
  { content: "Success is not final, failure is not fatal.", author: "Winston Churchill" },
  { content: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { content: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { content: "Your time is limited. Don't waste it living someone else's life.", author: "Steve Jobs" },
  { content: "The best revenge is massive success.", author: "Frank Sinatra" },
  { content: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { content: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { content: "Dream big and dare to fail.", author: "Norman Vaughan" },
  { content: "The harder you work, the luckier you get.", author: "Gary Player" }
];

// Initialize Gemini
const genAI = new GoogleGenerativeAI(config.geminiApiKey);
// const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
// await model.generateContent("Test connection");
console.log('Successfully initialized Gemini AI');
// 1. Generate a quote using Gemini
async function generateQuote() {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 256,
      }
    });
    
    const prompt = `Generate a short motivational quote in JSON format:
{
  "content": "<quote>",
  "author": "<author>"
}

Rules:
- Quote must be under 100 characters
- Focus on success or motivation
- Author must be well-known
- Response must be valid JSON only`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();
    
    try {
      // Clean and parse the response
      const cleanText = text.replace(/^```json\n|\n```$/g, '').trim();
      const quote = JSON.parse(cleanText);
      
      if (!quote.content || !quote.author) {
        console.error('Invalid quote format from Gemini');
        return getRandomFallbackQuote();
      }
      
      console.log('Successfully generated quote with Gemini:', quote);
      return quote;
    } catch (parseError) {
      console.error('Error parsing Gemini response:', parseError);
      console.error('Raw response:', text);
      return getRandomFallbackQuote();
    }
  } catch (error) {
    console.error('Error generating quote with Gemini:', error);
    return getRandomFallbackQuote();
  }
}

// Helper function to get a random fallback quote
function getRandomFallbackQuote() {
  const randomIndex = Math.floor(Math.random() * fallbackQuotes.length);
  return fallbackQuotes[randomIndex];
}

// 2. Create image with quote
async function createQuoteImage(quote, outputPath = 'quote_post.jpg') {
  // Canvas dimensions (Instagram prefers 1:1 or 4:5 aspect ratio)
  const width = 1080;
  const height = 1350; // 4:5 ratio for better Instagram visibility
  
  // Create canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Fill background with pure black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  
  // Add luxury pattern overlay
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.1)'; // Semi-transparent gold
  ctx.lineWidth = 1;
  
  // Create diagonal lines pattern
  for (let i = -height; i < width + height; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }
  
  // Add decorative corners
  const cornerSize = 100;
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)'; // More visible gold for corners
  ctx.lineWidth = 2;
  
  // Top left corner
  ctx.beginPath();
  ctx.moveTo(30, cornerSize);
  ctx.lineTo(30, 30);
  ctx.lineTo(cornerSize, 30);
  ctx.stroke();
  
  // Top right corner
  ctx.beginPath();
  ctx.moveTo(width - cornerSize, 30);
  ctx.lineTo(width - 30, 30);
  ctx.lineTo(width - 30, cornerSize);
  ctx.stroke();
  
  // Bottom left corner
  ctx.beginPath();
  ctx.moveTo(30, height - cornerSize);
  ctx.lineTo(30, height - 30);
  ctx.lineTo(cornerSize, height - 30);
  ctx.stroke();
  
  // Bottom right corner
  ctx.beginPath();
  ctx.moveTo(width - cornerSize, height - 30);
  ctx.lineTo(width - 30, height - 30);
  ctx.lineTo(width - 30, height - cornerSize);
  ctx.stroke();
  
  // Configure text styles for quote
  const maxLineWidth = width * 0.85;
  const lineHeight = 85;
  const fontSize = 68;
  const authorFontSize = 36;
  
  // Create gold gradient for text
  const textGradient = ctx.createLinearGradient(0, 0, width, 0);
  textGradient.addColorStop(0, '#BF953F');
  textGradient.addColorStop(0.5, '#FCF6BA');
  textGradient.addColorStop(1, '#B38728');
  
  // Add quote text with enhanced styling
  ctx.textAlign = 'center';
  ctx.fillStyle = textGradient;
  
  // Use a modern font
  ctx.font = `bold ${fontSize}px "Arial"`;
  
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
  ctx.font = `italic ${authorFontSize}px "Arial"`;
  ctx.fillStyle = 'rgba(212, 175, 55, 0.8)'; // Slightly transparent gold
  ctx.fillText(quote.author, width / 2, yPosition);
  
  // Add hashtag
  yPosition = height - 100;
  ctx.font = '24px Arial';
  ctx.fillStyle = 'rgba(212, 175, 55, 0.5)'; // More transparent gold
  ctx.fillText('#mindset', width / 2, yPosition);
  
  // Add watermark/branding
  ctx.fillStyle = 'rgba(212, 175, 55, 0.3)'; // Even more transparent gold
  ctx.fillText('@' + config.instagram.username, width / 2, height - 40);
  
  // Save the image
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createJPEGStream({ quality: 0.95 });
  stream.pipe(out);
  
  return new Promise((resolve, reject) => {
    out.on('finish', () => resolve(outputPath));
    out.on('error', reject);
  });
}

// 3. Post to Instagram
async function postToInstagram(imagePath, caption = '') {
  // Check if we can post now
  if (!canPostNow()) {
    throw new Error('Cannot post at this time due to safety limits');
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(config.instagram.username);
  
  try {
    console.log('Attempting to login to Instagram...');
    
    // Add random delay before login (30-60 seconds)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 30000 + 30000));
    
    // Login with pre-login flow simulation
    await ig.simulate.preLoginFlow();
    const loggedInUser = await ig.account.login(config.instagram.username, config.instagram.password);
    console.log('Successfully logged in to Instagram');
    
    // Random delay after login (1-2 minutes)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 60000 + 60000));
    
    // Process checks
    await ig.simulate.postLoginFlow();
    console.log('Post-login simulation completed');
    
    // Verify the image exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }
    
    // Check file size (Instagram max is 8MB)
    const stats = fs.statSync(imagePath);
    if (stats.size > 8 * 1024 * 1024) {
      throw new Error('Image file is too large (max 8MB)');
    }
    
    console.log('Uploading photo to Instagram...');
    
    // Random delay before posting (30-60 seconds)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 30000 + 30000));
    
    // Upload photo with retry mechanism
    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
      try {
        const publishResult = await ig.publish.photo({
          file: fs.readFileSync(imagePath),
          caption: caption
        });
        
        // Update safety tracking
        safetyConfig.dailyPostCount++;
        safetyConfig.lastPostTime = new Date();
        
        console.log('Successfully posted to Instagram:', publishResult);
        return publishResult;
      } catch (uploadError) {
        lastError = uploadError;
        console.error(`Upload attempt failed. ${retries - 1} retries remaining:`, uploadError.message);
        
        // Check for specific error types
        if (uploadError.message.includes('spam') || 
            uploadError.message.includes('block') || 
            uploadError.message.includes('login')) {
          console.error('Critical error detected, stopping retries');
          throw uploadError;
        }
        
        retries--;
        if (retries > 0) {
          // Wait longer between retries (2-3 minutes)
          await new Promise(resolve => setTimeout(resolve, Math.random() * 60000 + 120000));
        }
      }
    }
    
    throw new Error(`Failed to upload after multiple attempts: ${lastError?.message}`);
  } catch (error) {
    console.error('Error in Instagram posting process:', error);
    
    // Handle specific error types
    if (error.message.includes('login')) {
      console.error('Login error detected - possible account issue');
    } else if (error.message.includes('spam') || error.message.includes('block')) {
      console.error('Account may be restricted - implementing 24h cooldown');
      safetyConfig.lastPostTime = new Date(); // Force a long wait
      safetyConfig.dailyPostCount = safetyConfig.maxDailyPosts; // Prevent more posts today
    }
    
    throw error;
  }
}

// Main function to run the entire process
async function createAndPostQuote() {
  let imagePath = null;
  
  try {
    console.log('Starting quote generation and posting process...');
    
    // Step 1: Generate quote
    const quote = await generateQuote();
    console.log('Generated quote:', quote);
    
    // Step 2: Create image
    imagePath = 'quote_post.jpg';
    await createQuoteImage(quote, imagePath);
    console.log('Created quote image:', imagePath);
    
    // Step 3: Post to Instagram
    const hashtags = getRandomHashtags();
    const caption = `${quote.content}\n\n— ${quote.author}\n\n${hashtags}`;
    
    try {
      await postToInstagram(imagePath, caption);
      console.log('Successfully completed the posting process!');
    } catch (postError) {
      console.error('Failed to post to Instagram:', postError.message);
      console.log('The image was generated successfully but could not be posted.');
      console.log('You can find the image at:', imagePath);
      // Don't delete the image if posting failed, so it can be posted manually
      return;
    }
    
    // Clean up the image file only if posting was successful
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      console.log('Cleaned up temporary image file');
    }
    
  } catch (error) {
    console.error('Error in createAndPostQuote:', error);
    // Clean up the image file if it exists and we encountered an error
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
        console.log('Cleaned up temporary image file after error');
      } catch (cleanupError) {
        console.error('Error cleaning up temporary file:', cleanupError);
      }
    }
  }
}

// Schedule posts with safe random intervals
if (config.cronSchedule) {
  console.log('Setting up safe posting schedule...');
  
  // Schedule posts during safe windows
  safetyConfig.postingWindows.forEach(window => {
    // Create a cron schedule for each window
    const startHour = window.start;
    const randomMinute = Math.floor(Math.random() * 30); // Random minute in first half hour
    
    const schedule = `${randomMinute} ${startHour} * * *`;
    console.log(`Scheduling post window at: ${schedule}`);
    
    cron.schedule(schedule, async () => {
      try {
        if (canPostNow()) {
          console.log('Starting scheduled post...');
          await createAndPostQuote();
          
          // Add random delay before next post (4-8 hours)
          const nextPostDelay = getRandomDelay();
          console.log(`Next post scheduled in ${Math.round(nextPostDelay/3600000)} hours`);
        } else {
          console.log('Skipping post due to safety limits');
        }
      } catch (error) {
        console.error('Error in scheduled post:', error);
      }
    });
  });
  
  console.log('Safe posting schedule established');
} else {
  console.log('Running single post (test mode)');
  createAndPostQuote().catch(console.error);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('Gracefully shutting down...');
  process.exit(0);
}); 