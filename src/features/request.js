import clone from 'just-clone'
import URI from 'urijs'

export default class Request
{
	constructor(data) {
		Object.assign(this, data)

		this.time = parseFloat(this.time)
		this.responseDurationRounded = this.responseDuration ? Math.round(this.responseDuration) : 0
		this.databaseDurationRounded = this.databaseDuration ? Math.round(this.databaseDuration) : 0
		this.memoryUsageFormatted = this.memoryUsage ? this.formatBytes(this.memoryUsage) : undefined

		this.processCacheStats()
		this.cacheQueries = this.processCacheQueries(this.cacheQueries)
		this.cookies = this.createKeypairs(this.cookies)
		this.middleware = this.middleware instanceof Array ? this.middleware : []
		this.processDatabase()
		this.emails = this.processEmails(this.emailsData)
		this.events = this.processEvents(this.events)
		this.getData = this.createKeypairs(this.getData)
		this.requestData = this.requestData instanceof Object
			? this.createKeypairs(this.requestData, false) : this.requestData
		this.headers = this.processHeaders(this.headers)
		this.log = this.processLog(this.log)
		this.postData = this.createKeypairs(this.postData)
		this.queueJobs = this.processQueueJobs(this.queueJobs)
		this.redisCommands = this.processRedisCommands(this.redisCommands)
		this.sessionData = this.createKeypairs(this.sessionData)
		this.performanceMetrics = this.processPerformanceMetrics(this.performanceMetrics)
		this.timeline = this.processTimeline(this.timelineData)
		this.views = this.processViews(this.viewsData)
		this.userData = this.processUserData(this.userData)

		this.errorsCount = this.getErrorsCount()
		this.warningsCount = this.getWarningsCount()
		this.exceptions = this.processExceptions()
	}

	static placeholder(id, request, parent) {
		return Object.assign(new Request({
			loading: true,
			id: id,
			uri: request ? (new URI(request.url)).pathname() : '/',
			controller: 'Waiting...',
			method: request ? request.method : 'GET',
			responseStatus: '?',
			parent
		}), {
			responseDurationRounded: '?',
			databaseDurationRounded: '?'
		})
	}

	resolve(request) {
		Object.assign(this, request, { loading: false, error: undefined })
		return this
	}

	resolveWithError(error) {
		Object.assign(this, { loading: false, error })
		return this
	}

	extend(data, fields) {
		fields.forEach(field => this[field] = data[field])
		return this
	}

	isClientError() {
		return this.responseStatus >= 400 && this.responseStatus < 500
	}

	isServerError() {
		return this.responseStatus >= 500 && this.responseStatus < 600
	}

	createKeypairs(data, sorted = true) {
		if (! (data instanceof Object)) return []

		let keypairs = Object.keys(data).map(key => ({ name: key, value: data[key] }))

		if (sorted) keypairs = keypairs.sort((a, b) => a.name.localeCompare(b.name))

		return keypairs
	}

	processCacheStats() {
		if (this.cacheDeletes) this.cacheDeletes = parseInt(this.cacheDeletes)
		if (this.cacheHits) this.cacheHits = parseInt(this.cacheHits)
		if (this.cacheReads) this.cacheReads = parseInt(this.cacheReads)
		if (this.cacheWrites) this.cacheWrites = parseInt(this.cacheWrites)

		this.cacheMisses = this.cacheReads && this.cacheHits ? this.cacheReads - this.cacheHits : null
	}

	processCacheQueries(data) {
		if (! (data instanceof Array)) return []

		return data.map(query => {
			query.expiration = query.expiration ? this.formatTime(query.expiration) : undefined
			query.value = query.type == 'hit' || query.type == 'write' ? query.value : ''

			return query
		})
	}

	processDatabase() {
		this.databaseQueries = this.processDatabaseQueries(this.databaseQueries)

		this.databaseQueriesCount = parseInt(this.databaseQueriesCount) || this.databaseQueries.length
		this.databaseSlowQueries = parseInt(this.databaseSlowQueries)
			|| this.databaseQueries.filter(query => query.tags.includes('slow')).length
		this.databaseSelects = parseInt(this.databaseSelects)
			|| this.databaseQueries.filter(query => query.query.match(/^select /i)).length
		this.databaseInserts = parseInt(this.databaseInserts)
			|| this.databaseQueries.filter(query => query.query.match(/^insert /i)).length
		this.databaseUpdates = parseInt(this.databaseUpdates)
			|| this.databaseQueries.filter(query => query.query.match(/^update /i)).length
		this.databaseDeletes = parseInt(this.databaseDelets)
			|| this.databaseQueries.filter(query => query.query.match(/^delete /i)).length
		this.databaseOthers = parseInt(this.databaseOthers)
			|| this.databaseQueries.filter(query => ! query.query.match(/^(select|insert|update|delete) /i)).length
	}

	processDatabaseQueries(data) {
		if (! (data instanceof Array)) return []

		return data.map(query => {
			query.model = query.model || '-'
			query.shortModel = query.model ? query.model.split('\\').pop() : '-'
			query.tags = query.tags instanceof Array ? query.tags : []

			return query
		})
	}

	processEmails(data) {
		if (! (data instanceof Object)) return []

		return Object.values(data).filter(email => email.data instanceof Object).map(email => email.data)
	}

	processEvents(data) {
		if (! (data instanceof Array)) return []

		return data.map(event => {
			event.objectEvent = (event.data instanceof Object && event.event == event.data.__class__)
			event.time = event.time ? new Date(event.time * 1000) : undefined

			event.listeners = event.listeners instanceof Array ? event.listeners : []
			event.listeners = event.listeners.map(listener => {
				let shortName, matches

				if (matches = listener.match(/Closure \(.*[\/\\](.+?:\d+)-\d+\)/)) {
					shortName = 'Closure (' + matches[1] + ')'
				} else {
					shortName = listener.split(/[\/\\]/).pop()
				}

				return { name: listener, shortName }
			})

			return event
		})
	}

	processExceptions() {
		let exception = this.log.length ? this.log[this.log.length - 1].exception : null

		if (this.responseStatus != 500 || ! exception) return []

		exception = clone(exception)

		let current = exception;

		do {
			current.trace = [ {
				call:     `${current.type}()`,
				file:     current.file,
				line:     current.line,
				isVendor: false
			}, ...current.trace ]
		} while (current = current.previous)

		return [ exception ]
	}

	processHeaders(data) {
		if (! (data instanceof Object)) return []

		return Object.keys(data)
			.map(key => {
				let value = data[key]

				key = key.split('-').map(value =>
					value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
				).join('-')

				return { name: key, value }
			})
			.reduce((flat, header) => {
				header = header.value instanceof Array
					? header.value.map(value => ({ name: header.name, value })) : [ header ]

				return flat.concat(header)
			}, [])
			.sort((a, b) => a.name.localeCompare(b.name))
	}

	processLog(data) {
		if (! (data instanceof Array)) return []

		return data.map(message => {
			if (message.exception) {
				message.file = message.exception.file
				message.line = message.exception.line
				message.trace = message.exception.trace
			}

			message.time = new Date(message.time * 1000)
			message.context = message.context instanceof Object && Object.keys(message.context).filter(key => key != '__type__').length ? message.context : undefined

			return message
		})
	}

	processPerformanceMetrics(data) {
		if (! data) {
			return [
				{ name: 'Database', value: this.databaseDurationRounded, style: 'style2' },
				{ name: 'Cache', value: this.cacheTime, style: 'style3' },
				{ name: 'Other', value: (this.responseDurationRounded || 0) - (this.databaseDurationRounded || 0) - (this.cacheTime || 0), style: 'style1' }
			].filter(metric => metric.value !== null && metric.value !== undefined)
		}

		data = data.filter(metric => metric instanceof Object)
			.map((metric, index) => {
				metric.style = 'style' + (index + 2)
				return metric
			})

		let metricsSum = data.reduce((sum, metric) => { return sum + metric.value }, 0)

		data.push({ name: 'Other', value: this.responseDurationRounded - metricsSum, style: 'style1' })

		return data
	}

	processQueueJobs(data) {
		if (! (data instanceof Array)) return []

		return data.map(job => {
			job.shortName = job.name.split('\\').pop()

			return job
		})
	}

	processRedisCommands(data) {
		return data instanceof Array ? data : []
	}

	processTimeline(data) {
		if (! (data instanceof Object)) return []

		return Object.values(data).map((entry, i) => {
			entry.style = 'style' + (i % 4 + 1)
			entry.startPercentual = (entry.start - this.time) * 1000 / this.responseDuration * 100
			entry.durationPercentual = entry.duration / this.responseDuration * 100

			entry.barLeft = `${entry.startPercentual}%`
			entry.barWidth = entry.startPercentual + entry.durationPercentual < 100
				? `${entry.durationPercentual}%` : `${100 - entry.startPercentual}%`

			entry.labelAlign = 'left'
			entry.labelLeft = entry.barLeft
			entry.labelRight = 'auto'

			if (entry.startPercentual > 50) {
				entry.labelAlign = 'right'
				entry.labelLeft = 'auto'
				entry.labelRight = entry.durationPercentual < 1
					? `calc(100% - ${entry.barLeft} - 8px)` : `calc(100% - ${entry.barLeft} - ${entry.barWidth})`
			}

			entry.durationRounded = Math.round(entry.duration)
			if (entry.durationRounded === 0) entry.durationRounded = '< 1'

			return entry
		})
	}

	processViews(data) {
		return this.processTimeline(data) // needs fallback to the old data format

		if (! (data instanceof Object)) return []

		return Object.values(data).filter(view => view.data instanceof Object).map(view => view.data)
	}

	processUserData(tabs) {
		if (! (tabs instanceof Object)) return []

		let stripMeta = ([ key, section ]) => key != '__meta'
		let labeledValues = (labels) => ([ key, value ]) => ({ key: labels[key] || key, value })

		return Object.entries(tabs).filter(([ key, tab ]) => {
			return (tab instanceof Object) || tab.__meta || tab.__meta.title
		}).map(([ key, tab ]) => {
			return {
				key,
				title: tab.__meta.title,
				sections: Object.entries(tab).filter(stripMeta).map(([ key, section ]) => {
					let labels = section.__meta.labels || {}
					let data = section.__meta.showAs == 'counters'
						? Object.entries(section).filter(stripMeta).map(labeledValues(labels))
						: Object.entries(section).filter(stripMeta).map(([ key, value ]) => {
							return Object.entries(value).map(labeledValues(labels))
						})

					return {
						data,
						showAs: section.__meta.showAs,
						title: section.__meta.title
					}
				})
			}
		})
	}

	getErrorsCount() {
		return this.log.reduce((count, message) => {
			return message.level == 'error' ? count + 1 : count
		}, 0)
	}

	getWarningsCount() {
		return this.log.filter(message => message.level == 'warning').length
			+ this.databaseSlowQueries
	}

	formatTime(seconds) {
		let minutes = Math.floor(seconds / 60)
		let hours = Math.floor(minutes / 60)

		seconds = seconds % 60
		minutes = minutes % 60

		let time = []

		if (hours) time.push(hours + 'h')
		if (minutes) time.push(minutes + 'min')
		if (seconds) time.push(seconds + 'sec')

		return time.join(' ')
	}

	formatBytes(bytes) {
		let units = [ 'B', 'kB', 'MB', 'GB', 'TB', 'PB' ]
		let pow = Math.floor(Math.log(bytes) / Math.log(1024))

		return `${Math.round(bytes / Math.round(Math.pow(1024, pow)))} ${units[pow]}`
	}
}
