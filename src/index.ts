import * as dotenv from 'dotenv';

async function main() {
    dotenv.config();
}

main()
    .then()
    .catch((err) => {
        console.log(`Failed to run funding arb. Error: ${err.message}`);
    });
