// Generate unique slug on election creation
const generateSlug = (title) => {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + nanoid(6);
};

router.post('/', async (req, res) => {
  const { title, type, positions, startDate, endDate, scheduledStart, status } = req.body;
  const slug = generateSlug(title);
  const election = new Election({
    title, type, positions, startDate, endDate,
    scheduledStart: scheduledStart || null,
    status: status || 'draft',
    slug,
    registrationLink: `${process.env.CLIENT_URL}/frontend/nominee-register.html?event=${slug}`,
    votingLink: `${process.env.CLIENT_URL}/frontend/event-micro.html?event=${slug}`
  });
  await election.save();
  res.json({ success: true, data: election });
});