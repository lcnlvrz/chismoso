const { planner } = require('./crawler')
const fs = require('fs')
const path = require('path')

;(async () => {
  const products = [
    {
      id: 'clio',
      pages: 30,
    },
  ]

  for (const product of products) {
    await planner({
      maxPages: product.pages,
      productId: product.id,
    })

    // const reviews = await crawl({
    //   productId: product.id,
    //   maxPages: product.pages,
    // })

    // const reviewsPath = path.join(__dirname, `./reviews/${product.id}.json`)

    // await fs.promises.writeFile(reviewsPath, JSON.stringify(reviews, null, 2))

    // console.log('saved reviews to', reviewsPath)
  }

  process.exit(0)
})()
