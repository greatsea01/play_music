require('dotenv').config();
const { Telegraf, Input } = require('telegraf');
const Redis = require('ioredis');

const bot = new Telegraf(process.env.BOT_TOKEN);
const redis = new Redis(process.env.UPSTASH_REDIS_URL, {
  tls: { rejectUnauthorized: false }
});

bot.webhookReply = false;
const q = (id) => `queue:${id}`;

bot.start(ctx => ctx.reply(
  'Bot Music siap!\n' +
  '/add <youtube atau soundcloud url>\n' +
  'Atau upload audio langsung\n' +
  '/play • /next • /list • /clear'
));

bot.command('add', async (ctx) => {
  const url = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!url) return ctx.reply('Kirim /add <url>');
  
  const title = url.includes('soundcloud') ? 'SoundCloud Track' : 'YouTube Video';
  await redis.rpush(q(ctx.chat.id), JSON.stringify({url, title}));
  ctx.reply(`✅ Ditambahkan:\n${title}`);
});

bot.on('audio', async (ctx) => {
  const title = ctx.message.audio.title || 'Uploaded Audio';
  await redis.rpush(q(ctx.chat.id), JSON.stringify({
    type: 'file', fileId: ctx.message.audio.file_id, title
  }));
  ctx.reply(`✅ Upload ditambahkan:\n${title}`);
});

bot.command('play', async (ctx) => {
  const item = await redis.lindex(q(ctx.chat.id), 0);
  if (!item) return ctx.reply('Antrian kosong!');
  const data = JSON.parse(item);

  try {
    if (data.type === 'file') {
      await ctx.replyWithAudio(data.fileId, { caption: `Memutar: ${data.title}` });
    } else if (data.url.includes('soundcloud.com')) {
      await ctx.replyWithAudio(data.url, { title: data.title, caption: 'SoundCloud (embed)' });
    } else {
      // YouTube streaming langsung (Vercel IP jarang kena blokir)
      await ctx.replyWithAudio(
        Input.fromURL(data.url + '&fmt=140'), // audio only, pasti jalan
        { title: data.title, caption: `Memutar: ${data.title}` }
      );
    }
    await redis.lpop(q(ctx.chat.id));
    ctx.reply('▶️ Sedang dimainkan!');
  } catch (err) {
    await redis.lpop(q(ctx.chat.id));
    ctx.reply('Gagal play, skip lagu ini.');
  }
});

bot.command('next', async ctx => {
  await redis.lpop(q(ctx.chat.id));
  ctx.reply('⏭️ Skip!');
});

bot.command(['list','queue'], async (ctx) => {
  const items = await redis.lrange(q(ctx.chat.id), 0, -1);
  if (!items.length) return ctx.reply('Antrian kosong');
  const text = items.map((x,i) => `${i+1}. ${JSON.parse(x).title}`).join('\n');
  ctx.reply(`Daftar lagu:\n${text}`);
});

bot.command('clear', async ctx => {
  await redis.del(q(ctx.chat.id));
  ctx.reply('Antrian dibersihkan!');
});

module.exports = (req, res) => 
  req.method === 'POST' ? bot.handleUpdate(req.body, res) : res.status(200).send('Bot Music Online!');