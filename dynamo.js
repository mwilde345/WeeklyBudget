const dynamo = require('dynamodb');
const Joi = require('joi');
const Constants = require('./constants');
const moment = require('moment');

async function getTransaction(id) {
    return new Promise((res, rej) => {
        return Player.get(id, {ConsistentRead: true}, (err, player) => {
            if (err) {
                console.log('Error getting transaction ' + id);
                return rej(err)
            } else {
                console.log('got transaction ' + id);
                return res(player);
            }
        })
    })
}

 async function putTransaction(amount, category, card, description) {
    let id = `${moment().utc().format('YYYY-MM-DD')}-${card}-${amount}`
    let date = moment().utc().unix();
    let params = {
        id, date, amount, category, description
    }
    return new Promise((res, rej) => {
        return Transaction.create(params, (err, transaction) => {
            if (err) return rej(err)
            return res(transaction);
        })
    })
}

 async function updateTransaction(params) {
    return new Promise((res, rej) => {
        return Transaction.update(params, (err, transaction) => {
            if (err) return rej(err)
            return res(transaction);
        })
    })
}

async function getRange(range) {
    let start, end;
    if (range === Constants.MONTH) {
        start = moment().startOf('month').unix();
        end = moment().endOf('month').unix();
    } else {
        start = moment().startOf('week').unix();
        end = moment().endOf('week').unix();
    }
    return new Promise((res, rej) => {
        return Transaction
            .scan()
            .where('date').between(start,end)
            .loadAll()
            .exec( (err, data) => {
                if (err) rej(err)
                res(data)
            })
    })
}

const Transaction = dynamo.define('Transaction', {
    hashKey: 'id',
    timestamps: true,
    schema: Joi.object({
        id: Joi.string(),
        amount: Joi.number(),
        category: Joi.string(),
        date: Joi.number(),
        description: Joi.string()
    }),
    tableName: process.env.TRANSACTION_DB
})

module.exports = {
    putTransaction,
    getTransaction,
    getRange,
    updateTransaction
}