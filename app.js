const express = require(`express`);
const path = require(`path`);
const logger = require(`morgan`);
const wrap = require(`express-async-wrap`);
const _ = require(`lodash`);
const uuid = require(`uuid-by-string`);
const got = require(`got`);
const spacetime = require(`spacetime`);

const app = express();
app.use(logger(`dev`));
app.use(express.json());
app.use(express.urlencoded({extended: false}));

app.use(function (req, res, next) {
    console.log("Res: ", res);
    next();
});


app.get(`/logo`, (req, res) => res.sendFile(path.resolve(__dirname, `logo.svg`)));

const appConfig = require(`./config.app.json`);
app.get(`/`, (req, res) => res.json(appConfig));

app.post(`/validate`, wrap(async (req, res) => {  
    const token = req.body.fields.token;
    
    if (token != null) {
        const options = { headers: { 'Authorization': 'Token ' + token } };
        let response = await got('https://readwise.io/api/v2/auth/', options);    // add 401 handling code here

        if (response.statusCode === 204) {
            if (req.body.fields.connectionname) {
                return res.json({
                    name: `${req.body.fields.connectionname}`
                });                    
            }
            return res.json({
                name: 'Readwise'
            });
        }
    }

    //res.status(401).json({message: `Invalid access token`});
    
}));

const syncConfig = require(`./config.sync.json`);
app.post(`/api/v1/synchronizer/config`, (req, res) => res.json(syncConfig));

const schema = require(`./schema.json`);
app.post(`/api/v1/synchronizer/schema`, (req, res) => res.json(schema));

app.post(`/api/v1/synchronizer/datalist`, wrap(async (req, res) => {
    let tzs = spacetime().timezones;
    let tzname = Object.keys(tzs);
    tzname = tzname.map(getTitle);
    const items = tzname.sort((a, b) => (a.title > b.title) ? 1: -1);
    res.json({items});
}));

app.post(`/api/v1/synchronizer/data`, wrap(async (req, res) => {
    
    let {requestedType, pagination, account, lastSynchronizedAt, filter} = req.body;
    
    const options = { headers: { 'Authorization': 'Token ' + account.token } };
        
    if (requestedType !== `highlight` && requestedType != `book`) {
        throw new Error(`Only these database can be synchronized`);
    }
        
    if (requestedType == `highlight`){
        var url = 'https://readwise.io/api/v2/highlights';
        let response = await got(url, options);
        let body = JSON.parse(response.body);
        let highlights = body.results;
        
        let next = body.next;
        while (next !== null) {
            response = await got(next, options);
            body = JSON.parse(response.body);
            next = body.next;
            highlights = highlights.concat(body.results);
        } 
        
        /*
        let items = [];
        
        items = highlights.map(h => ({
            id:uuid((h.id).toString()),
            name:h.text,
            color:h.color,
            location:h.location,
            highlighted_at:h.highlighted_at,
            updated:h.updated,
            url:h.url,
            note:h.note,
            location_type:h.location_type,
            book:uuid((h.book_id).toString()),
            tags:(h.tags).map((t) => t.name)
        }));
        */
        
        let items = highlights.map((h) => ({...h, id: uuid((h.id).toString()), name: h.text, book: uuid((h.book_id).toString()), tags: (h.tags).map((t) => t.name)}));
        
        return res.json({items});
    }
    else if (requestedType == `book`){
        var url = 'https://readwise.io/api/v2/books';
        let response = await got(url, options);
        let body = JSON.parse(response.body);
        let books = body.results;

        let next = body.next;
        while (next !== null) {
            response = await got(next, options);
            body = JSON.parse(response.body);
            next = body.next;
            highlights = highlights.concat(body.results);
        } 
        
        let items = [];
        
        /*
        items = books.map(b => ({
            id:uuid((b.id).toString()),
            name:b.title,
            author:b.author,
            category:b.category,
            source:b.source,
            updated:b.updated,
            cover_image_url:b.cover_image_url,
            source_url:b.source_url,
            asin:b.asin,
            document_note:b.document_note,
            tags:(b.tags).map((t) => t.name)
        }));
        */
        
        items = books.map((b) => ({...b, id: uuid((b.id).toString()), name: b.title, tags: (b.tags).map((t) => t.name)}));
        
        return res.json({items});
        
    }
}));

app.use(function (req, res, next) {
    const error = new Error(`Not found`);
    error.status = 404;
    next(error);
});

app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    console.log(err);
    res.json({message: err.message, code: err.status || 500});
});

module.exports = app;
