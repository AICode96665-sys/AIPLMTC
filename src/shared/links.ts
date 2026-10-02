// Links the app can open in the user's web browser (never inside the app: see
// setWindowOpenHandler in src/main/index.ts). The app itself sends nothing.

/** Feedback & contact form (Google Forms). Responses go to the maintainer only. */
export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSc1W6mPMA03HYSyYntd1SC1K-55UhHdsjNW2uAbEIJaDBcFTg/viewform'

/** The same form with "What is this about?" set to "Report a problem". */
export const REPORT_PROBLEM_URL = `${FEEDBACK_FORM_URL}?usp=pp_url&entry.381205203=Report+a+problem`

/** The project on GitHub. */
export const REPO_URL = 'https://github.com/AICode96665-sys/AIPLMTC'
