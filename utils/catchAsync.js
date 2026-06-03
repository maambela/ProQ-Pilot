
// This is a utility function to catch errors in asynchronous functions
// fn is the asynchronous function to be wrapped which can fail and throw an error eg. email already exists (CAN BE ANY ERROR)
// 
module.exports = fn => { 
    return (req, res, next) => {
        fn(req, res, next).catch(next); // the .catch(next) is for if something goes wrong in the async function it tells express to call the next middleware with the error
    }
}