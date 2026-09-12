export function byteConversion(bytes: number | undefined, decimals = 2): string {

    if (bytes === 0 || bytes === undefined) return '0';

    const kiloByte = 1024;
    const decimal = decimals < 0 ? 0 : decimals;
    const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i: number = Math.floor(Math.log(bytes) / Math.log(kiloByte));

    return `${parseFloat((bytes / kiloByte ** i).toFixed(decimal))} ${sizes[i]}`;
}
