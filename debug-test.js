// Debug test for regex patterns
const text = "Project with API key sk-                    ";
const apiKey = "sk-                    ";

console.log("Original text:", JSON.stringify(text));
console.log("API key to match:", JSON.stringify(apiKey));

const patterns = [
  /sk-[^\n\r]*/g,
  /sk-\s+/g,
];

for (let i = 0; i < patterns.length; i++) {
  const pattern = patterns[i];
  console.log(`\nPattern ${i + 1}: ${pattern}`);
  
  const matches = text.match(pattern);
  console.log("Matches:", matches);
  
  const replaced = text.replace(pattern, '[REDACTED]');
  console.log("After replacement:", JSON.stringify(replaced));
  
  console.log("Still contains API key:", replaced.includes(apiKey));
}