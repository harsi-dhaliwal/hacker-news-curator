from typing import Union
from charset_normalizer import from_bytes


def decode_body(body: Union[bytes, bytearray, str]) -> str:
    if isinstance(body, (bytes, bytearray)):
        res = from_bytes(body).best()
        if res is None:
            return body.decode('utf-8', errors='ignore')
        return str(res)
    return str(body)

