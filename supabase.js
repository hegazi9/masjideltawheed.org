// supabase.js
// Al-Towheed Quran School — Database Connection

const SUPABASE_URL = 'https://mybjyoxfmbivamasxhyw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Ymp5b3hmbWJpdmFtYXN4aHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzUzMzQsImV4cCI6MjA5Mjg1MTMzNH0.BovV1TLnArBWoH4JTbhBbB9JEP5WuLZYe3jpHOxGs08';

window.addEventListener('load', () => {
  const { createClient } = window.supabase;
  window.db = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase connected');
});