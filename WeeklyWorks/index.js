/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */

const createScheduler = require('probot-scheduler')
const { WebClient } = require('@slack/web-api');
const slackAPI = new WebClient(process.env.SLACK_BOT_TOKEN);
const moment = require('moment');
const getConfig = require('probot-config');

module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  createScheduler(app, {
    delay: !!process.env.DISABLE_DELAY, // delay is enabled on first run
    interval: 24 * 60 * 60 * 1000 // 1 day
  })

  app.on('schedule.repository', context => {
    if (!isNeededNotify()) { return }
    notifyPullRequestToSlack(context)
  })
}

function isNeededNotify(context) {
  // 日曜日だけ通知する
  return moment().utc().day() == 0
}

async function notifyPullRequestToSlack(context) {
  const { owner, repo } = context.repo()
  const endDate = moment.utc().format()
  const startDate = moment.utc().subtract(7, 'days').format()
  const prList = await getAllPullRequests(context, owner, repo)
  const prText = await getPullRequestsText(prList, startDate, endDate)
  let text = `【<${context.payload.repository.html_url}|${context.payload.repository.full_name}>】`
  if (prText.length) {
    text += `今週は *${prText.length}* 件のプルリクエストが完了しました (${moment(startDate).format("YYYY-MM-DD")} ~ ${moment(endDate).format("YYYY-MM-DD")})。`
  } else {
    text += "今週完了したプルリクエストはありませんでした。"
  }
  description = prText.join("\n")
  postSlack(context, text, description)
}

async function postSlack(context, text, footer) {
  const config = await getConfig(context, 'WeeklyWorks.yml')
  if (!config.channel) { return }
  try {
    const result = await slackAPI.chat.postMessage({
      attachments: [
        {
          "fallback": `${text}`,
          "color": "#2eb886",
          "pretext": `${text}`,
          "footer": `${footer}`
        }
      ],
      channel: `${config.channel}`,
    });
    console.log('Message sent successfully', result.ts);
  } catch (error) {
    console.log('An error occurred', error);
  }
}

async function getPullRequestsText(prList, startDate, endDate) {
  return prList.filter(x => {
    return x.state === "closed" && moment(x.merged_at).utc().isBetween(startDate, endDate)
  }).map(x => {
    return `「<${x.html_url}|${x.title}>」 by <${x.user.html_url}|${x.user.login}>`
  })
}

async function getAllPullRequests(context, owner, repo) {
  let pullRequests = await context.github.paginate(
    context.github.pullRequests.list({
      owner,
      repo,
      state: 'closed',
      per_page: 100
    }),
    res => res.data
  )
  return pullRequests
}