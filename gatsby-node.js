const { createRemoteFileNode } = require('gatsby-source-filesystem')
const got = require('got')
const jsdom = require('jsdom')
const { JSDOM } = jsdom

exports.pluginOptionsSchema = ({ Joi }) => {
    return Joi.object({
        country: Joi.string().length(2)
            .default('www') // us
            .description('Language for users visiting review pages.'),
        business: Joi.string()
            .default('trustpilot.com')
            .description('Business unit to fetch from Trustpilot.'),
        languages: Joi.string().length(2)
            .default('all')
            .description('Fetch reviews written in a specific language.'),
        stars: Joi.array().items(Joi.number().valid(1, 2, 3, 4, 5))
            .default([1, 2, 3, 4, 5]) // all ratings
            .description('The star ratings to fetch.'),
    })
}

exports.sourceNodes = async ({
    actions: { createNode },
    createNodeId,
    createContentDigest,
}, pluginOptions) => {
    const business = pluginOptions.business.split('.')[0]
    const ucBusiness = business[0].toUpperCase() + business.slice(1)
    const stars = pluginOptions.stars.map(star => `stars=${star}`)
    const baseUrl = `https://${pluginOptions.country}.trustpilot.com`
    const url = `${baseUrl}/review/${pluginOptions.business}?languages=${pluginOptions.languages}&${stars.join('&')}`
    const data = await got(url).then(response => {
        const { document } = (new JSDOM(response.body)).window
        const children = []

        // console.log(document.querySelectorAll('.review'))
        document.querySelectorAll('.review').forEach(review => {
            const reviewLink = review.querySelector('.review-content__title .link')
            const reviewData = {
                id: `trust-${business}-review-${review.id}`,
                name: review.querySelector('.consumer-information__name').textContent.trim(),
                ratingSrc: review.querySelector('.star-rating img').src,
                ratingAlt: review.querySelector('.star-rating img').alt,
                location: review.querySelector('.consumer-information__location span')?.textContent, // Could be empty.
                date: JSON.parse(review.querySelector('.review-content-header__dates script').textContent).publishedDate,
                title: reviewLink.textContent.trim(),
                href: baseUrl + reviewLink.href, // URL path only.
                text: review.querySelector('.review-content__text')?.textContent.trim(), // Could be empty.
            }

            const reviewMeta = {
                id: createNodeId(reviewData.id),
                parent: `trust-${business}`,
                children: [],
                internal: {
                    type: `Trust${ucBusiness}Review`,
                    contentDigest: createContentDigest(reviewData),
                }
            }

            const reviewNode = Object.assign({}, reviewData, reviewMeta)
            createNode(reviewNode)

            children.push(reviewData.id)
        })

        const businessData = {
            reviewCount: document.querySelector('.header--inline').textContent.trim(),
            ratingSrc: document.querySelector('.star-rating img').src,
            ratingAlt: document.querySelector('.star-rating img').alt,
            score: document.querySelector('.header_trustscore').textContent
        }

        const businessMeta = {
            id: createNodeId(`trust-${business}`),
            parent: null,
            children,
            internal: {
                type: `Trust${ucBusiness}`,
                contentDigest: createContentDigest(businessData),
            }
        }

        const businessNode = Object.assign({}, businessData, businessMeta)
        createNode(businessNode)
    }).catch(error => {
        console.log(error)
    })

    return
}

exports.onCreateNode = async ({
    actions: { createNode },
    getCache,
    createNodeId,
    node,
}, pluginOptions) => {
    const business = pluginOptions.business.split('.')[0]
    const ucBusiness = business[0].toUpperCase() + business.slice(1)

    if (
        node.internal.type === `Trust${ucBusiness}Review` ||
        node.internal.type === `Trust${ucBusiness}`
    ) {
        const fileNode = await createRemoteFileNode({
            url: node.ratingSrc,
            getCache,
            createNode,
            createNodeId,
            parentNodeId: node.id,
        })

        if (fileNode) {
            node.ratingFile___NODE = fileNode.id
        }
    }
}
