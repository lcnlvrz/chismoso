const { connect } = require('puppeteer-real-browser')
const fs = require('fs')
const path = require('path')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const crawl = async ({ productId, pageRange, idsCache, duplicatedCounter }) => {
  const { page, browser } = await connect({
    headless: false,
    args: [],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
  })

  const reviews = []

  const [startPage, endPage] = pageRange

  let directoryCreated = false

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
    console.log(
      `total reviews collected: ${reviews.length}. duplicated:  `,
      duplicatedCounter.getValue()
    )

    const url = `https://www.g2.com/products/${productId}/reviews?order=lowest_rated&page=${pageNumber}`

    console.log('visiting', url, 'page', pageNumber)

    await page.goto(url, {
      waitUntil: 'networkidle0',
    })

    if (!directoryCreated) {
      try {
        await fs.promises.mkdir(path.join(__dirname, `./reviews/${productId}`))
      } catch (err) {
        console.log('Directory exists')
      }

      directoryCreated = true
    }

    await page.screenshot({
      path: `./reviews/${productId}/screenshot-page-${pageNumber}.png`,
    })

    const localReviews = await page
      .$$eval('#reviews > div.nested-ajax-loading > div', (elements) => {
        return elements.map((review) => {
          const reviewElement = review.querySelector('[id^="survey-response-"]')
          const reviewId = reviewElement?.id.replace('survey-response-', '')

          const date = review
            .querySelector('.x-current-review-date time')
            ?.getAttribute('datetime')
          const ratingClass =
            review
              .querySelector('.stars')
              ?.className.match(/stars-(\d+)/)?.[1] || '0'
          const title = review.querySelector('.l2')?.innerText

          const content = []
          const sections = review.querySelectorAll('.l5')
          sections.forEach((section) => {
            const question = section.innerText
            const answer = section.nextElementSibling
              ?.querySelector('.formatted-text')
              ?.innerText.replace(
                /Review collected by and hosted on G2.com./g,
                ''
              )
              .trim()
            if (question && answer) {
              content.push({
                question,
                answer,
              })
            }
          })

          return {
            id: reviewId,
            date,
            rating: parseInt(ratingClass),
            title,
            content,
          }
        })
      })
      .then((reviews) => reviews.filter((review) => review.content.length > 0))

    const distinctLocalReviews = localReviews.filter((review) => {
      if (!review.id) {
        console.log(`review without id ${JSON.stringify(review)}`)
        return false
      }

      if (idsCache[review.id]) {
        console.log(`review duplicated ${review.id}`)
        duplicatedCounter.increase()

        return false
      }

      idsCache[review.id] = true

      return true
    })

    console.log(
      `collected ${distinctLocalReviews.length} (${distinctLocalReviews
        .map((review) => review.id)
        .join(', ')}) reviews. duplicates current iteration: ${
        localReviews.length - distinctLocalReviews.length
      }`
    )

    reviews.push(...localReviews)

    await sleep(2000)
  }

  await page.close()

  return reviews
}

class Counter {
  constructor(initialValue = 0) {
    this.value = initialValue
  }

  increase() {
    this.value++
  }

  getValue() {
    return this.value
  }
}

const planner = async ({ productId, maxPages }) => {
  const MAX_ITERATIONS = 4

  const iterations = Math.ceil(maxPages / MAX_ITERATIONS)

  console.log(`Planner resolved to ${iterations} iterations`)

  const idsCache = {}
  const duplicatedCounter = new Counter()

  for (let i = 0; i < iterations; i++) {
    const pageRange = [i * MAX_ITERATIONS + 1, (i + 1) * MAX_ITERATIONS]

    const reviews = await crawl({
      productId,
      pageRange,
      idsCache,
      duplicatedCounter,
    })

    try {
      await fs.promises.mkdir(path.join(__dirname, `./reviews/${productId}`))
    } catch (err) {
      console.log('Directory exists')
    }

    const chunkPath = path.join(
      __dirname,
      `./reviews/${productId}/chunks/${i}.json`
    )

    try {
      await fs.promises.mkdir(
        path.join(__dirname, `./reviews/${productId}/chunks`)
      )
    } catch (err) {}

    await fs.promises.writeFile(chunkPath, JSON.stringify(reviews, null, 2))

    console.log(`Saved ${reviews.length} reviews to ${chunkPath}`)
  }

  console.log(`Reviews duplicated: ${duplicatedCounter.getValue()}`)

  await aggregate(productId)
}

const aggregate = async (productId) => {
  const chunks = await fs.promises.readdir(`./reviews/${productId}/chunks`)

  const reviews = []

  for (const chunk of chunks) {
    const chunkPath = path.join(
      __dirname,
      `./reviews/${productId}/chunks/${chunk}`
    )

    const chunkReviews = await fs.promises.readFile(chunkPath, 'utf-8')

    const chunkReviewsJson = JSON.parse(chunkReviews)

    reviews.push(...chunkReviewsJson)

    console.log(`Loaded chunk n ${chunk} from ${chunkPath}`)
  }

  const aggregatedReviewsPath = path.join(
    __dirname,
    `./reviews/${productId}/aggregated.json`
  )

  await fs.promises.writeFile(
    aggregatedReviewsPath,
    JSON.stringify(reviews, null, 2)
  )

  console.log(`Saved aggregated reviews to ${aggregatedReviewsPath}`)
}

const distinguish = async (aggregatedReviewsPath) => {
  const buffer = await fs.promises.readFile(aggregatedReviewsPath)

  const reviews = JSON.parse(buffer.toString('utf-8'))
}

module.exports.planner = planner
