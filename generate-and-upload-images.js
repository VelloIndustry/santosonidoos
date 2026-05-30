const fs = require('fs');

// Load .env manually
const envContent = fs.readFileSync('.env', 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) process.env[key.trim()] = valueParts.join('=').trim();
});

const OpenAI = require('openai');
const fetch = require('node-fetch');
const FormData = require('form-data');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});
const R2_BASE = 'https://polsia.com/api/proxy/r2';
const API_KEY = process.env.POLSIA_API_KEY;

const IMAGE_PROMPTS = [
  {
    name: 'santosonido-hero-01.webp',
    prompt: 'Professional music production studio with dramatic moody lighting, dark shadows with warm amber and gold accent lights, mixing console in foreground, studio monitors, cables and equipment visible. Latin music studio atmosphere in Medellín Colombia. Cinematic wide angle shot, film grain texture. Dark tones with gold highlights. No text, no logos, no people.',
    size: '1792x1024'
  },
  {
    name: 'santosonido-hero-02.webp',
    prompt: 'Close-up of professional music producer hands on MPC drum machine pads with warm amber studio lighting, dark moody atmosphere. Beat-making session, synthesizers and monitors in blurred background. Cinematic photography, shallow depth of field, film grain. Dark tones with gold and amber highlights. No text, no logos.',
    size: '1024x1024'
  },
  {
    name: 'santosonido-hero-03.webp',
    prompt: 'Professional recording studio vocal booth, microphone with pop filter in center, headphones hanging, dramatic backlit amber and gold lighting against dark walls. Latin music recording session atmosphere. Cinematic photography, moody and atmospheric, film grain texture. Dark background with warm gold accents. No text, no logos, no people.',
    size: '1024x1024'
  },
  {
    name: 'santosonido-hero-04.webp',
    prompt: 'Wide shot of professional music studio control room at night, large mixing desk, multiple studio monitors, rack-mounted equipment with LED indicators glowing amber and gold. Medellín city lights visible through window. Cinematic photography, dark and moody atmosphere, film grain. No text, no logos, no people.',
    size: '1792x1024'
  },
  {
    name: 'santosonido-logo-v4.webp',
    prompt: 'Minimalist luxury logo design on pure black background. Abstract golden sound wave forming letters "SS" intertwined. Clean geometric lines, gold metallic finish (#d4a847 gold color). Professional music brand mark. Simple, elegant, premium feel. Pure black background, gold metallic element only. No text other than the SS monogram.',
    size: '1024x1024'
  }
];

async function uploadToR2(imageBuffer, filename, mimeType) {
  const formData = new FormData();
  formData.append('file', imageBuffer, {
    filename,
    contentType: mimeType,
  });

  const response = await fetch(`${R2_BASE}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(`Upload failed for ${filename}: ${JSON.stringify(result)}`);
  }
  return result.file.url;
}

async function generateAndUpload(imageConfig) {
  console.log(`Generating: ${imageConfig.name}...`);

  const image = await openai.images.generate({
    model: 'dall-e-3',
    prompt: imageConfig.prompt,
    size: imageConfig.size,
    quality: 'hd',
    n: 1,
  });

  const imageUrl = image.data[0].url;
  console.log(`  Generated, downloading from DALL-E...`);

  // Download the image
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  console.log(`  Downloaded (${(imageBuffer.length / 1024).toFixed(0)} KB), uploading to R2...`);

  // Upload to R2
  const r2Url = await uploadToR2(imageBuffer, imageConfig.name, 'image/webp');
  console.log(`  Uploaded: ${r2Url}`);

  return { name: imageConfig.name, url: r2Url };
}

async function main() {
  console.log('Starting image generation and upload...\n');

  const results = {};

  // Generate sequentially to avoid rate limits
  for (const config of IMAGE_PROMPTS) {
    try {
      const result = await generateAndUpload(config);
      results[result.name] = result.url;
    } catch (err) {
      console.error(`  ERROR for ${config.name}: ${err.message}`);
    }
  }

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
