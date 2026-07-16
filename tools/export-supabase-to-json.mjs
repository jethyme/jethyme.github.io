const SUPABASE_URL = 'https://nrrqiedzcwmgzqkmaret.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1edDcYXXILaZ27t7oMEWMA_KIt2Ivck';
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};

const tasksRes = await fetch(SUPABASE_URL + '/rest/v1/tasks?select=*&order=order_index.asc', { headers: HEADERS });
if (!tasksRes.ok) { console.error('Tasks error:', tasksRes.status, await tasksRes.text()); process.exit(1); }
const tasks = await tasksRes.json();

const assigneesRes = await fetch(SUPABASE_URL + '/rest/v1/assignees?select=*&order=name.asc', { headers: HEADERS });
if (!assigneesRes.ok) { console.error('Assignees error:', assigneesRes.status, await assigneesRes.text()); process.exit(1); }
const assignees = await assigneesRes.json();

const historyRes = await fetch(SUPABASE_URL + '/rest/v1/task_history?select=*&order=changed_at.desc', { headers: HEADERS });
if (!historyRes.ok) { console.error('History error:', historyRes.status, await historyRes.text()); process.exit(1); }
const taskHistory = await historyRes.json();

const db = { assignees, tasks, taskHistory };
console.log(JSON.stringify(db, null, 2));
